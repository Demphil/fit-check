/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface WardrobeItem {
  id: string;
  name: string;
  url: string;
}

export interface OutfitLayer {
  garment: WardrobeItem | null; // null represents the base model layer
  poseImages: Record<string, string>; // Maps pose instruction to image URL
}

export interface Transaction {
  description: string;
  amount: number; // Positive for earning, negative for spending
  date: Date;
}

export interface User {
  isAuthenticated: boolean;
  name: string;
  plan: 'free' | 'basic' | 'premium';
  credits: number;
  generationsUsedThisSession: number;
  transactionHistory: Transaction[];
}
