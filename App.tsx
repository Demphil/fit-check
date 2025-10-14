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
import { OutfitLayer, WardrobeItem, Transaction } from './types';
import { useAuth } from './lib/AuthContext';
// 👇 استيراد جميع الأيقونات المطلوبة
import { ChevronDownIcon, ChevronUpIcon, GemIcon, CheckCircleIcon, XIcon, PlusIcon, LogOutIcon, UserIcon, DollarSignIcon } from './components/icons'; 
import { defaultWardrobe } from './wardrobe';
import Footer from './components/Footer';
import { getFriendlyErrorMessage, urlToFile } from './lib/utils';
import Spinner from './components/Spinner';
import UserHeader from './components/UserHeader';
import { getAuth } from 'firebase/auth';

type AppStatus = 'start' | 'recreating' | 'ready';
type ModalType = 'userMenu' | 'paywall' | 'earnCredits' | 'history' | null; 

const WORKER_URL = (import.meta as any).env.VITE_PAYMENT_WORKER_URL || 'https://fitcheck-payment.koora-live.workers.dev/'; 

const POSE_INSTRUCTIONS = [
  "Full frontal view, hands on hips",
  "Slightly turned, 3/4 view",
  "Side profile view",
  "Jumping in the air, mid-action shot",
  "Walking towards camera",
  "Leaning against a wall",
];

// دالة Media Query
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
  // 🔴 التعديل: إزالة `credits` و `addCredit` من هنا
  const { 
    appUser, 
    isAuthenticated, 
    isLoading: isAuthLoading, 
    error: authError,
    spendCredit,
    signInWithGoogle,
    logout,
    initiatePurchase // 💡 استيراد دالة الشراء الجديدة
  } = useAuth();
  
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
    if (!isAuthLoading && appStatus === 'start') {
      if (!isAuthenticated && modelImageUrl) {
        handleStartOver();
      }
    }
  }, [isAuthenticated, isAuthLoading, appStatus, modelImageUrl]);

  const addTransaction = (description: string, amount: number) => {
    console.log(`[Transaction] ${description}: ${amount}`);
  };

  const withGenerativeCheck = (callback: Function) => {
    return async (...args: any[]) => {
      if (appUser?.plan === 'premium') { 
        return callback(...args);
      }
      
      if (!isAuthenticated) {
          await signInWithGoogle();
          return;
      }
      
      // 🔴 التعديل: قراءة الرصيد من `appUser`
      if (appUser && appUser.credits > 0) { 
        try {
            await spendCredit(); 
            addTransaction(`Generation: ${args[1]?.name || 'Pose Change'}`, -1);
            return callback(...args);
        } catch (e) {
            setActiveModal('earnCredits');
            return;
        }
      } else {
        setActiveModal('earnCredits'); 
        return;
      }
    };
  };
  
  const handleLogout = async () => {
    setActiveModal(null);
    try {
        await logout();
    } catch(e) {
        setError('Failed to log out.');
    }
  }

  const handleModelFinalized = (url: string) => {
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
    setModelImageUrl(url);
    setOutfitHistory([{
      garment: null,
      poseImages: { [POSE_INSTRUCTIONS[0]]: url }
    }]);
    setCurrentOutfitIndex(0);
    setIsShareable(true);
    setAppStatus('ready');
  };
  
  const handleFileSelectionInitiation = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
            handleModelFinalized(URL.createObjectURL(target.files[0]));
        }
    };
    input.click();
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

    setError(null);
    setIsLoading(true);
    setLoadingMessage(`Adding ${garmentInfo.name}...`);

    try {
      const newImageUrl = await generateVirtualTryOnImage(displayImageUrl, garmentFile);
      const newLayer: OutfitLayer = { 
        garment: garmentInfo, 
        poseImages: { [POSE_INSTRUCTIONS[0]]: newImageUrl } 
      };

      setOutfitHistory(prevHistory => [...prevHistory.slice(0, currentOutfitIndex + 1), newLayer]);
      setCurrentOutfitIndex(prev => prev + 1);
      setCurrentPoseIndex(0);
      
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
          if (newHistory[targetOutfitIndex]) {
              newHistory[targetOutfitIndex].poseImages[poseInstruction] = newImageUrl;
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
  }, [currentPoseIndex, outfitHistory, isLoading, currentOutfitIndex]);
  
  const handlePoseSelect = withGenerativeCheck(handlePoseSelectInternal);

  const handleShare = useCallback(() => {
    if (!isShareable) return;
    try {
      const shareState = { m: modelImageUrl, g: activeGarmentIds, p: currentPoseIndex };
      const encodedState = btoa(JSON.stringify(shareState));
      const url = `${window.location.origin}${window.location.pathname}?share=${encodedState}`;
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setError("Share link copied to clipboard!");
      setTimeout(() => setError(null), 3000);
    } catch(err) {
      setError("Could not create share link.");
    }
  }, [isShareable, modelImageUrl, activeGarmentIds, currentPoseIndex]);

  const handleRemoveWardrobeItem = useCallback((itemId: string) => {
    if (defaultWardrobe.some(item => item.id === itemId)) return;
    if (outfitHistory.some(l => l.garment?.id === itemId)) {
        setError("Cannot delete an item that is part of the current outfit history. Please 'Start Over' to delete this item.");
        setTimeout(() => setError(null), 5000);
        return;
    }
    if (window.confirm("Are you sure you want to permanently delete this item? This action cannot be undone.")) {
        setWardrobe(prev => {
          const itemToRemove = prev.find(item => item.id === itemId);
          if (itemToRemove?.url.startsWith('blob:')) URL.revokeObjectURL(itemToRemove.url);
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
    if (isAuthLoading) {
        return (
            <div className="w-screen h-screen flex flex-col items-center justify-center bg-gray-50 text-center">
                <Spinner />
                <p className="text-lg font-serif text-gray-700 mt-4 px-4">Loading your session...</p>
                {authError && <p className="text-red-500 mt-2">{authError}</p>}
            </div>
        );
    }
    
    switch (appStatus) {
      case 'start':
        return (
          <motion.div
            key="start-screen"
            className="w-screen min-h-screen flex items-start sm:items-center justify-center bg-gray-50 p-4 pb-20"
            variants={viewVariants} initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartScreen 
              onModelFinalized={handleModelFinalized} 
              onSampleModelSelect={handleSampleModelSelect} 
              onGetStarted={isAuthenticated ? handleFileSelectionInitiation : signInWithGoogle} 
            />
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
            variants={viewVariants} initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <UserHeader 
                user={appUser 
                  // 🔴 التعديل: استخدام `appUser.credits` مباشرة
                  ? { name: appUser.name, credits: appUser.credits, isAuthenticated: true, plan: appUser.plan, generationsUsedThisSession: 0, transactionHistory: [] }
                  : { name: 'Guest', credits: 0, isAuthenticated: false, plan: 'free', generationsUsedThisSession: 0, transactionHistory: [] }
                }
                onHistoryClick={() => setActiveModal('history')} 
                onEarnCreditsClick={() => setActiveModal('earnCredits')} 
                onUserMenuClick={isAuthenticated ? () => setActiveModal('userMenu') : signInWithGoogle} 
            />
            
            <main className="flex-grow relative flex flex-col md:flex-row overflow-hidden pt-14">
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
          </motion.div>
        );
    }
  }
  
  const Modal = ({ children, onClose }: { children: React.ReactNode, onClose: () => void }) => (
    <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
        <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
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

  const PaywallModal = () => (
    <Modal onClose={() => setActiveModal(null)}>
      <div className="p-8">
        <h2 className="text-3xl font-serif tracking-wider text-gray-800 mb-2 text-center">Out of Credits!</h2>
        {/* 🔴 التعديل: قراءة الرصيد من `appUser` */}
        <p className="text-gray-600 mb-6 text-center">Your current credits: <strong className="text-gray-900">{appUser?.credits ?? 0}</strong>. Please purchase or earn more.</p>
        <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-gray-800">Premium Plan</h3>
            <p className="text-gray-600 mt-1">Get unlimited generations, high-resolution exports, and priority support.</p>
            <ul className="mt-4 space-y-2 text-gray-700">
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Unlimited Generations</li>
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Faster Processing</li>
                <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Save Looks to Your Profile</li>
            </ul>
            <button onClick={() => setActiveModal('earnCredits')} className="mt-6 w-full text-center bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-700">
                Buy Credits Now
            </button>
        </div>
      </div>
    </Modal>
  );
  
  const EarnCreditsModal = () => {
    const [isWatchingAd, setIsWatchingAd] = useState(false);
    
    // 🔴 التعديل: استخدام `initiatePurchase` مباشرة من `useAuth`
    const { initiatePurchase, isLoading: isBuying, error: purchaseError } = useAuth();

    const watchAd = async () => {
      // لا توجد دالة `addCredit` في السياق، لذا هذا الجزء للمحاكاة فقط
      if (isWatchingAd) return;
      setIsWatchingAd(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        addTransaction('Watched Ad (Simulation)', 1); 
      } catch (e) {
        setError('Failed to add credit after ad. Try again.');
      } finally {
        setIsWatchingAd(false);
      }
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
              {purchaseError && <p className="text-red-500 text-sm mt-2 text-center">{purchaseError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button 
                    onClick={() => initiatePurchase('basic')} 
                    disabled={isBuying}
                    className="text-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-300 relative"
                >
                    {isBuying ? <Spinner className="absolute inset-0 m-auto"/> : null}
                    <p className={`font-bold text-lg ${isBuying ? 'opacity-0' : ''}`}>20 Credits</p>
                    <p className={`text-sm ${isBuying ? 'opacity-0' : ''}`}>$1.99</p>
                </button>
                <button 
                    onClick={() => initiatePurchase('pro')} 
                    disabled={isBuying}
                    className="text-center bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 hover:bg-gray-300 relative"
                >
                    {isBuying ? <Spinner className="absolute inset-0 m-auto"/> : null}
                    <p className={`font-bold text-lg ${isBuying ? 'opacity-0' : ''}`}>50 Credits</p>
                    <p className={`text-sm ${isBuying ? 'opacity-0' : ''}`}>$3.99</p>
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
          <p className="text-center text-gray-500 py-8">Transaction history is currently managed by Firestore. Please implement a Firestore listener here.</p>
        </div>
      </Modal>
   );

  const UserMenuModal = () => (
    <Modal onClose={() => setActiveModal(null)}>
      <div className="p-4 w-full">
        <h3 className="text-xl font-serif font-bold text-gray-800 border-b pb-2 mb-4">Account</h3>
        <div className="space-y-2">
            <button 
                onClick={() => setActiveModal('history')}
                className="w-full flex items-center px-4 py-3 bg-gray-50 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
            >
                <UserIcon className="w-5 h-5 mr-3"/> View History
            </button>
            <button 
                onClick={() => setActiveModal('earnCredits')}
                className="w-full flex items-center px-4 py-3 bg-gray-50 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
            >
                <DollarSignIcon className="w-5 h-5 mr-3"/> Earn / Buy Credits
            </button>
            <hr className="my-2 border-gray-200" />
            <button 
                onClick={handleLogout}
                className="w-full flex items-center px-4 py-3 bg-red-500 rounded-lg text-white font-bold hover:bg-red-600 transition-colors"
            >
                <LogOutIcon className="w-5 h-5 mr-3"/> Sign Out
            </button>
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
        {activeModal === 'paywall' && <PaywallModal />}
        {activeModal === 'earnCredits' && <EarnCreditsModal />}
        {activeModal === 'history' && <HistoryModal />}
        {activeModal === 'userMenu' && <UserMenuModal />}
      </AnimatePresence>
      <Footer isOnDressingScreen={appStatus === 'ready'} />
    </div>
  );
};

export default App;