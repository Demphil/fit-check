/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { User } from '../types';
import { GemIcon } from './icons';

interface UserHeaderProps {
    user: User;
    onHistoryClick: () => void;
    onEarnCreditsClick: () => void;
}

const UserHeader: React.FC<UserHeaderProps> = ({ user, onHistoryClick, onEarnCreditsClick }) => {
    return (
        <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-200/60 p-3 z-40">
            <div className="mx-auto flex items-center justify-between max-w-7xl px-4">
                <div>
                    <span className="font-semibold text-gray-800">Welcome, {user.name}</span>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={onEarnCreditsClick} 
                        className="flex items-center justify-center gap-2 bg-yellow-400/20 text-yellow-800 font-bold py-2 px-4 rounded-full transition-all duration-200 ease-in-out hover:bg-yellow-400/40 active:scale-95 text-sm"
                    >
                        <GemIcon className="w-5 h-5"/>
                        <span>{user.credits} Credits</span>
                    </button>
                    <button onClick={onHistoryClick} className="font-semibold text-gray-600 hover:text-gray-900 text-sm">
                        My Looks
                    </button>
                </div>
            </div>
        </header>
    );
};

export default UserHeader;
