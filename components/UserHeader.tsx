import React from 'react';
// 👇 💡 تم تصحيح المسار لـ AuthContext
import { useAuth } from '../lib/AuthContext'; 
// 👇 💡 تم تصحيح المسار لـ icons.tsx
import { GemIcon, DotsVerticalIcon, UserIcon, DollarSignIcon } from './icons';

interface UserData {
    name: string;
    credits: number;
    isAuthenticated: boolean;
    plan: 'free' | 'basic' | 'premium';
    generationsUsedThisSession: number;
    transactionHistory: any[];
}

interface UserHeaderProps {
    user: UserData;
    onHistoryClick: () => void;
    onEarnCreditsClick: () => void;
    onUserMenuClick: () => void; // الحدث لفتح قائمة المستخدم
}

const UserHeader: React.FC<UserHeaderProps> = ({ user, onHistoryClick, onEarnCreditsClick, onUserMenuClick }) => {
    const { isAuthenticated, credits, appUser } = useAuth();
    
    // شرط العرض: لا نعرض الرأس إذا لم يكن المستخدم مسجلاً
    if (!isAuthenticated || !appUser) return null; 

    const displayName = appUser.name.split(' ')[0] || 'User';

    return (
        <header className="fixed top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200 py-2 px-4 shadow-sm">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
                <div className="text-xl font-serif font-bold text-gray-900">
                    FitCheck
                </div>
                
                <div className="flex items-center space-x-4">
                    {/* عرض الرصيد */}
                    <div className="flex items-center text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-full shadow-inner">
                        <GemIcon className="w-4 h-4 text-yellow-500 mr-2" />
                        {credits} Credits
                    </div>

                    {/* زر لكسب المزيد من الرصيد */}
                    <button 
                        onClick={onEarnCreditsClick} 
                        className="text-sm font-semibold text-white bg-green-500 px-3 py-1.5 rounded-full hover:bg-green-600 transition-colors"
                    >
                        + Earn
                    </button>
                    
                    {/* زر قائمة المستخدم (الذي يفتح مودال تسجيل الخروج) */}
                    <button 
                        onClick={onUserMenuClick} 
                        className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                        aria-label="User Menu"
                    >
                        {/* استخدام أيقونة المستخدم (UserIcon) التي كنا نعمل على إضافتها */}
                        <UserIcon className="w-6 h-6 text-gray-700" />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default UserHeader;
