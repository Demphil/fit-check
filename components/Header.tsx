/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GemIcon, PlusIcon, UserIcon } from './icons'; // افترض أن الأيقونات موجودة

// 💡 هذا هو شكل البيانات التي يستقبلها المكون من App.tsx
interface UserHeaderProps {
  user: {
    name: string;
    credits: number;
    isAuthenticated: boolean;
  };
  onEarnCreditsClick: () => void;
  onUserMenuClick: () => void;
  onHistoryClick: () => void;
}

const UserHeader: React.FC<UserHeaderProps> = ({ user, onEarnCreditsClick, onUserMenuClick }) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-10 h-14 flex items-center justify-between px-4 sm:px-6 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
      <div className="flex items-center">
        <h1 className="text-xl font-bold font-serif text-gray-800">FitCheck</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {user.isAuthenticated ? (
          <>
            {/* 🔴 التعديل: دمج زر الرصيد وزر الكسب لعرض أفضل */}
            <div className="flex items-center">
              <div 
                className="flex items-center gap-2 pl-3 pr-4 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-l-full"
              >
                <GemIcon className="w-4 h-4 text-yellow-500" />
                {/* التأكد من عرض الرصيد كرقم */}
                <span>{typeof user.credits === 'number' ? user.credits : 0}</span> 
              </div>
              <button 
                onClick={onEarnCreditsClick} 
                className="flex items-center gap-2 pl-3 pr-4 py-1.5 text-sm font-bold text-white bg-green-500 rounded-r-full hover:bg-green-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                <span>Earn</span>
              </button>
            </div>
            
            <button onClick={onUserMenuClick} className="p-2 rounded-full hover:bg-gray-100">
              <UserIcon className="w-6 h-6 text-gray-600" />
            </button>
          </>
        ) : (
          // أزرار للزائر غير المسجل
          <button 
            onClick={onUserMenuClick} // onUserMenuClick سيقوم بتشغيل signInWithGoogle
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-800 rounded-md hover:bg-gray-700 transition-colors"
          >
            Sign In / Sign Up
          </button>
        )}
      </div>
    </header>
  );
};

export default UserHeader;
