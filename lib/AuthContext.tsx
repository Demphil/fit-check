/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { auth, db } from '../firebase'; 
import { 
  User as FirebaseUser,
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment,
  onSnapshot
} from 'firebase/firestore';

// -----------------------------------------------------
// الأنواع والتفاصيل
// -----------------------------------------------------

interface AppUser {
    uid: string;
    name: string;
    email: string;
    credits: number; 
    plan: 'free' | 'basic' | 'pro';
}

interface AuthContextType {
    appUser: AppUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
    logout: () => void;
    spendCredit: () => Promise<void>;
    initiatePurchase: (plan: 'basic' | 'pro') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_COLLECTION = 'users'; 

// -----------------------------------------------------
// الدالة الرئيسية (AuthProvider)
// -----------------------------------------------------

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let unsubscribeSnapshot: () => void = () => {};

        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(db, USER_COLLECTION, firebaseUser.uid);
                
                unsubscribeSnapshot = onSnapshot(userDocRef, async (docSnapshot) => {
                    setIsLoading(true);
                    if (docSnapshot.exists()) {
                        const data = docSnapshot.data();
                        setAppUser({
                            uid: firebaseUser.uid,
                            name: data.name || firebaseUser.displayName || 'User',
                            email: firebaseUser.email || '',
                            // 🔴🔴🔴 التعديل الحاسم هنا: تحويل الرصيد إلى رقم دائماً 🔴🔴🔴
                            credits: parseInt(String(data.credits), 10) || 0,
                            plan: data.plan || 'free',
                        });
                    } else {
                        // إنشاء مستخدم جديد
                        const newUserData = {
                            name: firebaseUser.displayName || 'User',
                            email: firebaseUser.email || '',
                            credits: 1,
                            plan: 'free' as const,
                            createdAt: new Date(),
                        };
                        await setDoc(userDocRef, newUserData);
                        setAppUser({ ...newUserData, uid: firebaseUser.uid });
                    }
                    setError(null);
                    setIsLoading(false);
                }, (error) => {
                    console.error("Firestore snapshot error:", error);
                    setError("Failed to sync user data.");
                    setIsLoading(false);
                });

            } else {
                // تسجيل الخروج
                unsubscribeSnapshot();
                setAppUser(null);
                setIsLoading(false);
            }
        });
        
        return () => {
            unsubscribeAuth();
            unsubscribeSnapshot();
        };
    }, []);

    const signInWithGoogle = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (e) {
            const friendlyError = e instanceof Error ? e.message : "Authentication failed.";
            setError(friendlyError);
            setIsLoading(false);
        }
    };

    const logout = async () => {
        await signOut(auth);
    };

    const spendCredit = async (): Promise<void> => {
        if (!appUser || appUser.credits <= 0) {
            throw new Error("No credits left.");
        }
        const userRef = doc(db, USER_COLLECTION, appUser.uid);
        await updateDoc(userRef, {
            credits: increment(-1), 
        });
    };
    
    const initiatePurchase = async (plan: 'basic' | 'pro') => {
        if (!auth.currentUser) {
            setError("You must be logged in to make a purchase.");
            throw new Error("User not authenticated.");
        }
        setIsLoading(true);
        try {
            const token = await auth.currentUser.getIdToken(true);
            const uid = auth.currentUser.uid;
            const workerUrl = (import.meta as any).env.VITE_PAYMENT_WORKER_URL;

            if (!workerUrl) {
                throw new Error("Payment worker URL is not configured.");
            }

            const response = await fetch(workerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan, token, uid })
            });

            const data = await response.json();

            if (response.ok && data.redirect_url) {
                window.location.href = data.redirect_url;
            } else {
                throw new Error(data.error || "Failed to create PayPal order.");
            }
        } catch (e) {
            const friendlyError = e instanceof Error ? e.message : "An unknown error occurred.";
            console.error("Purchase initiation failed:", friendlyError);
            setError(friendlyError);
        } finally {
            setIsLoading(false);
        }
    };

    const value: AuthContextType = {
        appUser, 
        isAuthenticated: !!appUser,
        isLoading,
        error,
        signInWithGoogle,
        logout,
        spendCredit,
        initiatePurchase,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};