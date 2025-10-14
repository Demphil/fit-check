/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloudIcon, LogInIcon, DollarSignIcon, ZapIcon } from './icons';
import { Compare } from './ui/compare';
import { generateModelImage } from '../services/geminiService';
import Spinner from './Spinner';
import { getFriendlyErrorMessage } from '../lib/utils';
// 👇 استيراد useAuth
import { useAuth } from '../lib/AuthContext'; 

interface StartScreenProps {
  onModelFinalized: (modelUrl: string) => void;
  onSampleModelSelect: (modelUrl: string) => void;
  onGetStarted: () => void;
}

const SAMPLE_MODEL_URL = "https://storage.googleapis.com/gemini-95-icons/asr-tryon-model.png";
const SAMPLE_USER_URL = "https://storage.googleapis.com/gemini-95-icons/asr-tryon.jpg";

// 👇 مكون النافذة المنبثقة (Modal)
const AuthCreditModal: React.FC<{
  onClose: () => void;
  onGoogleSignIn: () => void;
  onInitiatePurchase: (plan: 'basic' | 'pro') => void; // 💡 إضافة دالة الشراء
  isAuthenticated: boolean;
  credits: number;
  isLoading: boolean;
}> = ({ onClose, onGoogleSignIn, onInitiatePurchase, isAuthenticated, credits, isLoading }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4 flex items-center">
          <ZapIcon className="w-6 h-6 mr-2 text-yellow-500" />
          {isAuthenticated ? "Activate Your Session" : "Start Your Free Trial"}
        </h2>
        
        {isAuthenticated ? (
          <>
            <p className="text-gray-600 mb-6">
              You have <strong className="text-gray-900">{credits} credit(s)</strong> remaining. Create a model requires 1 credit.
            </p>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">Get More Credits</h3>
            <div className="space-y-3">
              {/* 🔴 زر شراء الخطة الأساسية */}
              <div className="border border-indigo-200 bg-indigo-50 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold text-indigo-700">Basic Plan</p>
                  <p className="text-sm text-indigo-600">20 Credits - Great for starting!</p>
                </div>
                <button 
                  onClick={() => onInitiatePurchase('basic')}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {isLoading ? '...' : '$1.99'}
                </button>
              </div>

              {/* 🔴 زر شراء الخطة المتقدمة */}
              <div className="border border-green-200 bg-green-50 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold text-green-700">Pro Plan</p>
                  <p className="text-sm text-green-600">50 Credits - Best Value!</p>
                </div>
                <button 
                  onClick={() => onInitiatePurchase('pro')}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-bold text-white bg-green-600 rounded-md hover:bg-green-700 transition disabled:opacity-50"
                >
                  {isLoading ? '...' : '$3.99'}
                </button>
              </div>

              {/* ... (زر الإعلانات يبقى كما هو) ... */}
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600 mb-6">
              Sign in with your Google account to get your **one-time free credit** and save your creations.
            </p>
            <button
              onClick={onGoogleSignIn}
              disabled={isLoading}
              className="w-full relative flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-blue-600 rounded-md cursor-pointer group hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <LogInIcon className="w-5 h-5 mr-2" />
              {isLoading ? 'Signing In...' : 'Sign in with Google'}
            </button>
            <button
              onClick={onClose}
              className="mt-3 w-full py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition"
            >
              Maybe Later (Use Sample Model)
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};


const StartScreen: React.FC<StartScreenProps> = ({ onModelFinalized, onSampleModelSelect, onGetStarted }) => {
  const { appUser, isAuthenticated, signInWithGoogle, spendCredit, initiatePurchase } = useAuth();
  const [userImageUrl, setUserImageUrl] = useState<string | null>(null);
  const [generatedModelUrl, setGeneratedModelUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false); 

  const handleGoogleSignIn = async () => {
    try {
      setIsGenerating(true);
      await signInWithGoogle();
      setShowCreditModal(false);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Failed to sign in with Google'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (!appUser || appUser.credits <= 0) {
      setError('You need at least 1 credit to generate a model.');
      setShowCreditModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setUserImageUrl(dataUrl);
      setIsGenerating(true);
      setGeneratedModelUrl(null);
      setError(null);
      try {
        await spendCredit(); // خصم الرصيد قبل البدء
        const result = await generateModelImage(file);
        setGeneratedModelUrl(result);
      } catch (err) {
        setError(getFriendlyErrorMessage(err, 'Failed to create model'));
        setUserImageUrl(null);
        // ملاحظة: لا نعيد الرصيد هنا، يمكن تنفيذ منطق أكثر تعقيداً إذا لزم الأمر
      } finally {
        setIsGenerating(false);
      }
    };
    reader.readAsDataURL(file);
  }, [appUser, spendCredit]);

  const handleGetStartedClick = () => {
      if (isAuthenticated && appUser && appUser.credits > 0) {
        // إذا كان المستخدم مسجلاً ولديه رصيد، افتح نافذة اختيار الملفات
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        };
        input.click();
      } else {
        // إذا لم يكن مسجلاً أو نفد رصيده، اعرض نافذة الشراء/التسجيل
        setShowCreditModal(true);
      }
  };

  const reset = () => {
    setUserImageUrl(null);
    setGeneratedModelUrl(null);
    setIsGenerating(false);
    setError(null);
  };

  const screenVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  };

  return (
    <>
    <AnimatePresence mode="wait">
      {!userImageUrl ? (
        <motion.div
          key="uploader"
          className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12"
          variants={screenVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <div className="lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="max-w-lg">
              <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 leading-tight">
                Create Your Model for Any Look.
              </h1>
              <p className="mt-4 text-lg text-gray-600">
                Ever wondered how an outfit would look on you? Stop guessing. Upload a photo or use our sample model to start styling. Our AI creates your personal model, ready to try on anything.
              </p>
              <hr className="my-8 border-gray-200" />
              <div className="flex flex-col items-center lg:items-start w-full gap-3">
                 <button 
                  onClick={handleGetStartedClick}
                  className="w-full sm:w-auto flex-grow relative flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-gray-900 rounded-md cursor-pointer group hover:bg-gray-700 transition-colors"
                  disabled={isGenerating}
                  >
                  {isAuthenticated && appUser && appUser.credits > 0 ? `Create Model (${appUser.credits} Left)` : 'Get Started for Free'}
                 </button>
                <button 
                  onClick={() => onSampleModelSelect(SAMPLE_MODEL_URL)}
                  className="w-full sm:w-auto px-6 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md cursor-pointer hover:bg-gray-200 transition-colors"
                >
                  Use Sample Model
                </button>
                <p className="text-gray-500 text-sm">Select a clear, full-body photo for best results.</p>
                <p className="text-gray-500 text-xs mt-1">By uploading, you agree not to create harmful content. This service is for creative and responsible use only.</p>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </div>
            </div>
          </div>
          <div className="w-full lg:w-1/2 flex flex-col items-center justify-center">
            <Compare
              firstImage={SAMPLE_USER_URL}
              secondImage={SAMPLE_MODEL_URL}
              slideMode="drag"
              className="w-full max-w-sm aspect-[2/3] rounded-2xl bg-gray-200"
            />
          </div>
        </motion.div>
      ) : (
        <motion.div
        key="compare"
        className="w-full max-w-6xl mx-auto h-full flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12"
        variants={screenVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <div className="md:w-1/2 flex-shrink-0 flex flex-col items-center md:items-start">
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 leading-tight">
              The New You
            </h1>
            <p className="mt-2 text-md text-gray-600">
              Drag the slider to see your transformation.
            </p>
          </div>
          
          {isGenerating && (
            <div className="flex items-center gap-3 text-lg text-gray-700 font-serif mt-6">
              <Spinner />
              <span>Generating your model...</span>
            </div>
          )}

          {error &&
            <div className="text-center md:text-left text-red-600 max-w-md mt-6">
              <p className="font-semibold">Generation Failed</p>
              <p className="text-sm mb-4">{error}</p>
              <button onClick={reset} className="text-sm font-semibold text-gray-700 hover:underline">Try Again</button>
            </div>
          }
          
          <AnimatePresence>
            {generatedModelUrl && !isGenerating && !error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col sm:flex-row items-center gap-4 mt-8"
              >
                <button
                  onClick={reset}
                  className="w-full sm:w-auto px-6 py-3 text-base font-semibold text-gray-700 bg-gray-200 rounded-md cursor-pointer hover:bg-gray-300 transition-colors"
                >
                  Use Different Photo
                </button>
                <button
                  onClick={() => onModelFinalized(generatedModelUrl)}
                  className="w-full sm:w-auto relative inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-gray-900 rounded-md cursor-pointer group hover:bg-gray-700 transition-colors"
                >
                  Proceed to Styling &rarr;
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="md:w-1/2 w-full flex items-center justify-center">
          <div
            className={`relative rounded-[1.25rem] transition-all duration-700 ease-in-out ${isGenerating ? 'border border-gray-300 animate-pulse' : 'border-transparent'}`}
          >
            <Compare
              firstImage={userImageUrl}
              secondImage={generatedModelUrl ?? userImageUrl}
              slideMode="drag"
              className="w-[280px] h-[420px] sm:w-[320px] sm:h-[480px] lg:w-[400px] lg:h-[600px] rounded-2xl bg-gray-200"
            />
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
    
    <AnimatePresence>
      {showCreditModal && (
        <AuthCreditModal
          onClose={() => setShowCreditModal(false)}
          onGoogleSignIn={handleGoogleSignIn}
          onInitiatePurchase={initiatePurchase} // 💡 تمرير الدالة هنا
          isAuthenticated={isAuthenticated}
          credits={appUser?.credits ?? 0}
          isLoading={isGenerating}
        />
      )}
    </AnimatePresence>

    </>
  );
};

export default StartScreen;
