/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import type { WardrobeItem } from '../types';
import { UploadCloudIcon, CheckCircleIcon, XIcon } from './icons';
import { urlToFile } from '../lib/utils';

interface WardrobePanelProps {
  onGarmentSelect: (garmentFile: File, garmentInfo: WardrobeItem) => void;
  activeGarmentIds: string[];
  isLoading: boolean;
  wardrobe: WardrobeItem[];
  onRemoveItem: (itemId: string) => void;
}

const WardrobePanel: React.FC<WardrobePanelProps> = ({ onGarmentSelect, activeGarmentIds, isLoading, wardrobe, onRemoveItem }) => {
    const [error, setError] = useState<string | null>(null);

    const handleGarmentClick = async (item: WardrobeItem) => {
        if (isLoading || activeGarmentIds.includes(item.id)) return;
        setError(null);
        try {
            const file = await urlToFile(item.url, item.name);
            onGarmentSelect(file, item);
        } catch (err) {
            const detailedError = `Failed to load wardrobe item.`;
            setError(detailedError);
            console.error(err);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!file.type.startsWith('image/')) {
                setError('Please select an image file.');
                return;
            }
            const customGarmentInfo: WardrobeItem = {
                id: `custom-${Date.now()}`,
                name: file.name,
                url: URL.createObjectURL(file),
            };
            onGarmentSelect(file, customGarmentInfo);
        }
    };

  return (
    <div className="pt-6 border-t border-gray-400/50">
        <h2 className="text-xl font-serif tracking-wider text-gray-800 mb-3">Wardrobe</h2>
        <div className="grid grid-cols-3 gap-3">
            {wardrobe.map((item) => {
                const isActive = activeGarmentIds.includes(item.id);
                const isCustom = item.id.startsWith('custom-');
                return (
                    <div key={item.id} className="relative group">
                        <button
                            onClick={() => handleGarmentClick(item)}
                            disabled={isLoading || isActive}
                            className="w-full aspect-square border rounded-lg overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label={`Select ${item.name}`}
                        >
                            <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-white text-xs font-bold text-center p-1">{item.name}</p>
                            </div>
                            {isActive && (
                                <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center">
                                    <CheckCircleIcon className="w-8 h-8 text-white" />
                                </div>
                            )}
                        </button>
                        {isCustom && !isActive && (
                            <button
                                onClick={() => onRemoveItem(item.id)}
                                disabled={isLoading}
                                className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-white rounded-full flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-300 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                aria-label={`Delete ${item.name}`}
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            })}
            <label htmlFor="custom-garment-upload" className={`relative aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-500 transition-colors ${isLoading ? 'cursor-not-allowed bg-gray-100' : 'hover:border-gray-400 hover:text-gray-600 cursor-pointer'}`}>
                <UploadCloudIcon className="w-6 h-6 mb-1"/>
                <span className="text-xs text-center">Upload</span>
                <input id="custom-garment-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp, image/avif, image/heic, image/heif" onChange={handleFileChange} disabled={isLoading}/>
            </label>
        </div>
        {wardrobe.length === 0 && (
             <p className="text-center text-sm text-gray-500 mt-4">Your uploaded garments will appear here.</p>
        )}
        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
    </div>
  );
};

export default WardrobePanel;
