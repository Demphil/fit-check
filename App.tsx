/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StartScreen from './components/StartScreen';
import Canvas from './components/Canvas';
import WardrobePanel from './components/WardrobeModal';
import OutfitStack from './components/OutfitStack';
import { generateVirtualTryOnImage, generatePoseVariation } from './services/geminiService';
import { OutfitLayer, WardrobeItem, User, Transaction } from './types';
import { ChevronDownIcon, ChevronUpIcon, GemIcon, CheckCircleIcon, XIcon, PlusIcon } from './components/icons';
import { defaultWardrobe } from './wardrobe';
import Footer from './components/Footer';
import { getFriendlyErrorMessage, urlToFile } from './lib/utils';
import Spinner from './components/Spinner';
import UserHeader from './components/UserHeader';

type AppStatus = 'start' | 'recreating' | 'ready';
type ModalType = 'auth' | 'paywall' | 'earnCredits' | 'history' | null;

const POSE_INSTRUCTIONS = [
  "Full frontal view, hands on hips",
  "Slightly turned, 3/4 view",
  "Side profile view",
  "Jumping in the air, mid-action shot",
  "Walking towards camera",
  "Leaning against a wall",
];

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    mediaQueryList.addEventListener('change', listener);
    
    if (mediaQueryList.matches !== matches) {
      setMatches(mediaQueryList.matches);
    }

    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query, matches]);

  return matches;
};


const App: React.FC = () => {
  const [appStatus, setAppStatus] = useState<AppStatus>('start');
  const [modelImageUrl, setModelImageUrl] = useState<string | null>(null);
  const [outfitHistory, setOutfitHistory] = useState<OutfitLayer[]>([]);
  const [currentOutfitIndex, setCurrentOutfitIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(defaultWardrobe);
  const [isShareable, setIsShareable] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  // New state for user, auth, and monetization
  const [user, setUser] = useState<User>({
    isAuthenticated: false,
    name: 'Guest',
    plan: 'free',
    credits: 0,
    generationsUsedThisSession: 0,
    transactionHistory: [],
  });
  const [activeModal, setActiveModal] = useState<ModalType>(null);


  const activeOutfitLayers = useMemo(() => 
    outfitHistory.slice(0, currentOutfitIndex + 1), 
    [outfitHistory, currentOutfitIndex]
  );
  
  const activeGarmentIds = useMemo(() => 
    activeOutfitLayers.slice(1).map(layer => layer.garment?.id).filter(Boolean) as string[], 
    [activeOutfitLayers]
  );
  
  const displayImageUrl = useMemo(() => {
    if (outfitHistory.length === 0) return modelImageUrl;
    const currentLayer = outfitHistory[currentOutfitIndex];
    if (!currentLayer) return modelImageUrl;

    const poseInstruction = POSE_INSTRUCTIONS[currentPoseIndex];
    return currentLayer.poseImages[poseInstruction] ?? Object.values(currentLayer.poseImages)[0];
  }, [outfitHistory, currentOutfitIndex, currentPoseIndex, modelImageUrl]);

  const availablePoseKeys = useMemo(() => {
    if (outfitHistory.length === 0) return [];
    const currentLayer = outfitHistory[currentOutfitIndex];
    return currentLayer ? Object.keys(currentLayer.poseImages) : [];
  }, [outfitHistory, currentOutfitIndex]);

  useEffect(() => {
    const loadSharedOutfit = async (encodedData: string) => {
      try {
        setAppStatus('recreating');
        setIsShareable(true);
        setLoadingMessage('Recreating shared outfit...');

        const decodedState = JSON.parse(atob(encodedData));
        const { m: modelUrl, g: garmentIds, p: poseIndex } = decodedState;

        if (!modelUrl || !Array.isArray(garmentIds) || typeof poseIndex !== 'number') {
          throw new Error('Invalid share data format.');
        }
        
        // Shared links grant temporary premium access to view
        setUser(prev => ({...prev, plan: 'premium', name: 'Viewer'}));

        setModelImageUrl(modelUrl);
        let currentHistory: OutfitLayer[] = [{ garment: null, poseImages: { [POSE_INSTRUCTIONS[0]]: modelUrl } }];
        setOutfitHistory(currentHistory);
        let currentImageUrlForNextStep = modelUrl;

        for (let i = 0; i < garmentIds.length; i++) {
          const garmentId = garmentIds[i];
          const garmentInfo = defaultWardrobe.find(item => item.id === garmentId);
          if (!garmentInfo) {
            console.warn(`Shared garment with id ${garmentId} not found in default wardrobe. Skipping.`);
            continue;
          }
          
          setLoadingMessage(`Applying ${garmentInfo.name} (${i + 1} of ${garmentIds.length})...`);
          
          const garmentFile = await urlToFile(garmentInfo.url, garmentInfo.name);
          const newImageUrl = await generateVirtualTryOnImage(currentImageUrlForNextStep, garmentFile);
          
          const newLayer: OutfitLayer = { 
            garment: garmentInfo, 
            poseImages: { [POSE_INSTRUCTIONS[0]]: newImageUrl } 
          };
          currentHistory = [...currentHistory, newLayer];
          setOutfitHistory(currentHistory);
          setCurrentOutfitIndex(i + 1);
          currentImageUrlForNextStep = newImageUrl;
        }

        if (poseIndex > 0 && poseIndex < POSE_INSTRUCTIONS.length) {
          setLoadingMessage('Adjusting final pose...');
          await handlePoseSelect(poseIndex, true, currentHistory.length - 1, currentHistory);
        } else {
          setCurrentPoseIndex(poseIndex);
        }
        
        setAppStatus('ready');
      } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Could not load the shared outfit'));
        setTimeout(() => {
          handleStartOver();
        }, 3000);
      } finally {
        setLoadingMessage('');
      }
    };
    
    const params = new URLSearchParams(window.location.search);
    const shareData = params.get('share');
    if (shareData) {
      loadSharedOutfit(shareData);
    }
  }, []);

  const addTransaction = (description: string, amount: number) => {
    const newTransaction: Transaction = { description, amount, date: new Date() };
    setUser(prev => ({
      ...prev,
      transactionHistory: [newTransaction, ...prev.transactionHistory],
    }));
  };
  
  const handleGetStarted = () => setActiveModal('auth');
  
  const handleAuthSuccess = (guest: boolean = false) => {
    if (guest) {
      setUser(prev => ({ ...prev, isAuthenticated: false, name: 'Guest' }));
    } else {
      setUser(prev => ({ 
        ...prev, 
        isAuthenticated: true, 
        name: 'Ammaar', // Mock name
        credits: 5,
        plan: 'basic',
        transactionHistory: [{ description: 'Sign-up bonus', amount: 5, date: new Date() }]
      }));
    }
    setActiveModal(null);
  }

  const withGenerativeCheck = (callback: Function) => {
    return async (...args: any[]) => {
      if (user.plan === 'premium') {
        return callback(...args);
      }

      if (!user.isAuthenticated) { // Guest flow
        if (user.generationsUsedThisSession > 0) {
          setActiveModal('paywall');
          return;
        }
        setUser(prev => ({ ...prev, generationsUsedThisSession: prev.generationsUsedThisSession + 1 }));
        return callback(...args);
      }
      
      if (user.credits > 0) { // Authenticated user flow
        setUser(prev => ({ ...prev, credits: prev.credits - 1 }));
        addTransaction(`Generation: ${args[1]?.name || 'Pose Change'}`, -1);
        return callback(...args);
      } else {
        setActiveModal('earnCredits');
        return;
      }
    };
  };

  const handleModelFinalized = (url: string) => {
    handleAuthSuccess(false); // Assume upload means they want to sign in
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [POSE_INSTRUCTIONS[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
    setIsShareable(false);
    setAppStatus('ready');
  };

  const handleSampleModelSelect = (url: string) => {
    handleAuthSuccess(false); // Assume sample model selection means they want to sign in
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [POSE_INSTRUCTIONS[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
    setIsShareable(true);
    setAppStatus('ready');
  };

  const handleStartOver = () => {
    setAppStatus('start');
    setModelImageUrl(null);
    setOutfitHistory([]);
    setCurrentOutfitIndex(0);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
    setCurrentPoseIndex(0);
    setIsSheetCollapsed(false);
    setWardrobe(defaultWardrobe);
    setIsShareable(false);
    setUser({
      isAuthenticated: false,
      name: 'Guest',
      plan: 'free',
      credits: 0,
      generationsUsedThisSession: 0,
      transactionHistory: [],
    });
    if (window.history.pushState) {
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
  };

  const handleGarmentSelectInternal = useCallback(async (garmentFile: File, garmentInfo: WardrobeItem) => {
    if (!displayImageUrl || isLoading) return;

    const nextLayer = outfitHistory[currentOutfitIndex + 1];
    if (nextLayer && nextLayer.garment?.id === garmentInfo.id) {
        setCurrentOutfitIndex(prev => prev + 1);
        setCurrentPoseIndex(0);
        return;
    }
    if (garmentInfo.id.startsWith('custom-')) {
        setIsShareable(false);
    }

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Adding ${garmentInfo.name}...`);

    try {
      const newImageUrl = await generateVirtualTryOnImage(displayImageUrl, garmentFile);
      const currentPoseInstruction = POSE_INSTRUCTIONS[0];
      
      const newLayer: OutfitLayer = { 
        garment: garmentInfo, 
        poseImages: { [currentPoseInstruction]: newImageUrl } 
      };

      setOutfitHistory(prevHistory => {
        const newHistory = prevHistory.slice(0, currentOutfitIndex + 1);
        return [...newHistory, newLayer];
      });
      setCurrentOutfitIndex(prev => prev + 1);
      setCurrentPoseIndex(0);
      
      setWardrobe(prev => {
        if (prev.find(item => item.id === garmentInfo.id)) {
            return prev;
        }
        return [...prev, garmentInfo];
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to apply garment'));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [displayImageUrl, isLoading, outfitHistory, currentOutfitIndex]);

  const handleGarmentSelect = withGenerativeCheck(handleGarmentSelectInternal);

  const handleRemoveLastGarment = () => {
    if (currentOutfitIndex > 0) {
      setCurrentOutfitIndex(prevIndex => prevIndex - 1);
      setCurrentPoseIndex(0);
    }
  };
  
  const handlePoseSelectInternal = useCallback(async (
    newIndex: number, 
    isSharedFlow: boolean = false,
    targetOutfitIndex = currentOutfitIndex, 
    targetOutfitHistory = outfitHistory
  ) => {
      if (isLoading || targetOutfitHistory.length === 0 || (!isSharedFlow && newIndex === currentPoseIndex)) return;
      
      const poseInstruction = POSE_INSTRUCTIONS[newIndex];
      const currentLayer = targetOutfitHistory[targetOutfitIndex];
  
      if (currentLayer.poseImages[poseInstruction]) {
        setCurrentPoseIndex(newIndex);
        return;
      }
  
      const baseImageForPoseChange = Object.values(currentLayer.poseImages)[0];
      if (!baseImageForPoseChange) return;
  
      setError(null);
      setIsLoading(true);
      setLoadingMessage(`Changing pose...`);
      
      const prevPoseIndex = currentPoseIndex;
      setCurrentPoseIndex(newIndex);
  
      try {
        const newImageUrl = await generatePoseVariation(baseImageForPoseChange, poseInstruction);
        setOutfitHistory(prevHistory => {
          const newHistory = [...prevHistory];
          const layerToUpdate = newHistory.find((_, idx) => idx === targetOutfitIndex);
          if (layerToUpdate) {
              layerToUpdate.poseImages[poseInstruction] = newImageUrl;
          }
          return newHistory;
        });
      } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Failed to change pose'));
        setCurrentPoseIndex(prevPoseIndex);
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex]
  );
  const handlePoseSelect = withGenerativeCheck(handlePoseSelectInternal);


  const handleShare = useCallback(() => {
    if (!isShareable) return;
    try {
      const shareState = {
        m: modelImageUrl,
        g: activeGarmentIds,
        p: currentPoseIndex
      };
      const encodedState = btoa(JSON.stringify(shareState));
      const url = `${window.location.origin}${window.location.pathname}?share=${encodedState}`;
      navigator.clipboard.writeText(url);
    } catch(err) {
      console.error("Failed to create share link", err);
      setError("Could not create share link.");
    }
  }, [isShareable, modelImageUrl, activeGarmentIds, currentPoseIndex]);

  const handleRemoveWardrobeItem = useCallback((itemId: string) => {
    if (defaultWardrobe.some(item => item.id === itemId)) {
        return;
    }
    const allGarmentIdsInHistory = outfitHistory.map(l => l.garment?.id);
    if (allGarmentIdsInHistory.includes(itemId)) {
        setError("Cannot delete an item that is part of the current outfit history. Please 'Start Over' to delete this item.");
        setTimeout(() => setError(null), 5000);
        return;
    }
    if (window.confirm("Are you sure you want to permanently delete this item? This action cannot be undone.")) {
        setWardrobe(prev => {
          const itemToRemove = prev.find(item => item.id === itemId);
          if (itemToRemove && itemToRemove.url.startsWith('blob:')) {
            URL.revokeObjectURL(itemToRemove.url);
          }
          return prev.filter(item => item.id !== itemId);
        });
    }
  }, [outfitHistory]);

  const viewVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
  };

  const renderContent = () => {
    switch (appStatus) {
      case 'start':
        return (
          <motion.div
            key="start-screen"
            className="w-screen min-h-screen flex items-start sm:items-center justify-center bg-gray-50 p-4 pb-20"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartScreen onModelFinalized={handleModelFinalized} onSampleModelSelect={handleSampleModelSelect} onGetStarted={handleGetStarted} />
          </motion.div>
        );
      case 'recreating':
        return (
          <div className="w-screen h-screen flex flex-col items-center justify-center bg-white text-center">
            <Spinner />
            <p className="text-lg font-serif text-gray-700 mt-4 px-4">{loadingMessage}</p>
            {error && <p className="text-red-500 mt-2">{error}</p>}
          </div>
        )
      case 'ready':
        return (
          <motion.div
            key="main-app"
            className="relative flex flex-col h-screen bg-white overflow-hidden"
            variants={viewVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            {user.isAuthenticated && <UserHeader user={user} onHistoryClick={() => setActiveModal('history')} onEarnCreditsClick={() => setActiveModal('earnCredits')} />}
            <main className={`flex-grow relative flex flex-col md:flex-row overflow-hidden ${user.isAuthenticated ? 'pt-14' : ''}`}>
              <div className="w-full h-full flex-grow flex items-center justify-center bg-white pb-16 relative">
                <Canvas 
                  displayImageUrl={displayImageUrl}
                  onStartOver={handleStartOver}
                  isLoading={isLoading}
                  loadingMessage={loadingMessage}
                  onSelectPose={handlePoseSelect}
                  poseInstructions={POSE_INSTRUCTIONS}
                  currentPoseIndex={currentPoseIndex}
                  availablePoseKeys={availablePoseKeys}
                  isShareable={isShareable}
                  onShare={handleShare}
                />
              </div>

              <aside 
                className={`absolute md:relative md:flex-shrink-0 bottom-0 right-0 h-auto md:h-full w-full md:w-1/3 md:max-w-sm bg-white/80 backdrop-blur-md flex flex-col border-t md:border-t-0 md:border-l border-gray-200/60 transition-transform duration-500 ease-in-out ${isSheetCollapsed ? 'translate-y-[calc(100%-4.5rem)]' : 'translate-y-0'} md:translate-y-0`}
                style={{ transitionProperty: 'transform' }}
              >
                  <button 
                    onClick={() => setIsSheetCollapsed(!isSheetCollapsed)} 
                    className="md:hidden w-full h-8 flex items-center justify-center bg-gray-100/50"
                    aria-label={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
                  >
                    {isSheetCollapsed ? <ChevronUpIcon className="w-6 h-6 text-gray-500" /> : <ChevronDownIcon className="w-6 h-6 text-gray-500" />}
                  </button>
                  <div className="p-4 md:p-6 pb-20 overflow-y-auto flex-grow flex flex-col gap-8">
                    {error && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                      </div>
                    )}
                    <OutfitStack 
                      outfitHistory={activeOutfitLayers}
                      onRemoveLastGarment={handleRemoveLastGarment}
                    />
                    <WardrobePanel
                      onGarmentSelect={handleGarmentSelect}
                      activeGarmentIds={activeOutfitLayers.map(l => l.garment?.id).filter(Boolean) as string[]}
                      isLoading={isLoading}
                      wardrobe={wardrobe}
                      onRemoveItem={handleRemoveWardrobeItem}
                    />
                  </div>
              </aside>
            </main>
            <AnimatePresence>
              {isLoading && isMobile && (
                <motion.div
                  className="fixed inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Spinner />
                  {loadingMessage && (
                    <p className="text-lg font-serif text-gray-700 mt-4 text-center px-4">{loadingMessage}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
    }
  }
  
  const Modal = ({ children, onClose }: { children: React.ReactNode, onClose: () => void }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
        <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-2xl w-full max-w-md flex flex-col shadow-xl"
        >
            {children}
            <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                <XIcon className="w-6 h-6"/>
            </button>
        </motion.div>
    </motion.div>
  );

  const AuthModal = () => (
    <Modal onClose={() => setActiveModal(null)}>
      <div className="p-8 text-center">
        <h2 className="text-3xl font-serif tracking-wider text-gray-800 mb-2">Welcome</h2>
        <p className="text-gray-600 mb-6">Sign in to save your looks and get more credits.</p>
        <div className="flex flex-col gap-3">
            <button onClick={() => handleAuthSuccess()} className="w-full text-center bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-700">
                Sign in with Google
            </button>
            <button onClick={() => {
              handleAuthSuccess(true);
              // Directly move to the ready state with a sample model
              handleSampleModelSelect("https://storage.googleapis.com/gemini-95-icons/asr-tryon-model.png");
            }} className="w-full text-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-300">
                Continue as Guest (1 Free Try)
            </button>
        </div>
        <p className="text-xs text-gray-400 mt-6">By continuing, you agree to our terms of service.</p>
      </div>
    </Modal>
  );

  const PaywallModal = () => (
    <Modal onClose={() => setActiveModal(null)}>
      <div className="p-8">
        <h2 className="text-3xl font-serif tracking-wider text-gray-800 mb-2 text-center">Out of Tries!</h2>
        <p className="text-gray-600 mb-6 text-center">Please sign up to continue creating amazing outfits.</p>
        <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-gray-800">Premium Plan</h3>
            <p className="text-gray-600 mt-1">Get unlimited generations, high-resolution exports, and priority support.</p>
            <ul className="mt-4 space-y-2 text-gray-700">
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Unlimited Generations</li>
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Faster Processing</li>
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Save Looks to Your Profile</li>
            </ul>
            <button onClick={() => { handleAuthSuccess(); }} className="mt-6 w-full text-center bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-700">
                Sign Up Now
            </button>
        </div>
      </div>
    </Modal>
  );
  
  const EarnCreditsModal = () => {
    const [isWatchingAd, setIsWatchingAd] = useState(false);

    const watchAd = () => {
      setIsWatchingAd(true);
      setTimeout(() => {
        setUser(prev => ({ ...prev, credits: prev.credits + 1 }));
        addTransaction('Watched Ad', 1);
        setIsWatchingAd(false);
      }, 2000);
    }

    const buyCredits = (amount: number, price: string) => {
        setUser(prev => ({ ...prev, credits: prev.credits + amount }));
        addTransaction(`Purchased ${amount} credits`, amount);
        setActiveModal(null);
    }

    return (
      <Modal onClose={() => setActiveModal(null)}>
        <div className="p-8">
          <h2 className="text-3xl font-serif tracking-wider text-gray-800 mb-2 text-center">Get More Credits</h2>
          <p className="text-gray-600 mb-6 text-center">Watch an ad for a free credit or purchase a bundle.</p>
          <div className="space-y-4">
              <button onClick={watchAd} disabled={isWatchingAd} className="w-full text-center bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-blue-500 flex items-center justify-center disabled:bg-blue-300">
                {isWatchingAd ? <Spinner /> : <><PlusIcon className="w-5 h-5 mr-2" /> Watch Ad (Earn 1 Credit)</>}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => buyCredits(20, "$1.99")} className="text-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-300">
                    <p className="font-bold text-lg">20 Credits</p>
                    <p className="text-sm">$1.99</p>
                </button>
                <button onClick={() => buyCredits(50, "$3.99")} className="text-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-300">
                    <p className="font-bold text-lg">50 Credits</p>
                    <p className="text-sm">$3.99</p>
                </button>
              </div>
          </div>
        </div>
      </Modal>
    );
  };
  
  const HistoryModal = () => (
     <Modal onClose={() => setActiveModal(null)}>
        <div className="p-6">
          <h2 className="text-2xl font-serif tracking-wider text-gray-800 mb-4 border-b pb-2">Transaction History</h2>
          <div className="max-h-80 overflow-y-auto pr-2">
              {user.transactionHistory.length > 0 ? (
                <ul className="space-y-2">
                    {user.transactionHistory.map((tx, index) => (
                        <li key={index} className="flex justify-between items-center bg-gray-50 p-2 rounded-md text-sm">
                            <div>
                                <p className="font-semibold text-gray-800">{tx.description}</p>
                                <p className="text-gray-500 text-xs">{tx.date.toLocaleString()}</p>
                            </div>
                            <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.amount > 0 ? `+${tx.amount}` : tx.amount} <GemIcon className="w-4 h-4 inline-block -mt-1"/>
                            </span>
                        </li>
                    ))}
                </ul>
              ) : (
                <p className="text-center text-gray-500 py-8">No transactions yet.</p>
              )}
          </div>
        </div>
     </Modal>
  );

  return (
    <div className="font-sans">
      <AnimatePresence mode="wait">
        {renderContent()}
      </AnimatePresence>
      <AnimatePresence>
        {activeModal === 'auth' && <AuthModal />}
        {activeModal === 'paywall' && <PaywallModal />}
        {activeModal === 'earnCredits' && <EarnCreditsModal />}
        {activeModal === 'history' && <HistoryModal />}
      </AnimatePresence>
      <Footer isOnDressingScreen={appStatus === 'ready'} />
    </div>
  );
};

export default App;
