import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useSetupStore } from '../../../application/state/setupStore';
import { Loader2, Store, Edit3 } from 'lucide-react';

export const StoreSetupScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [storeName, setStoreName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { saveStoreProfile, error } = useSetupStore();

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) return;

    setIsSaving(true);
    const success = await saveStoreProfile(storeName);
    setIsSaving(false);

    if (success) {
      onNext();
    }
  };

  const displayName = storeName.trim() || 'Your Store Name';

  return (
    <div className="w-full h-full flex items-center justify-center max-w-[1200px] mx-auto">

      {/* Left Content Side */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 relative z-10 w-full max-w-[580px]">

        <div className="mb-8">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 stagger-1">
            <Edit3 className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-[36px] md:text-[42px] font-semibold text-slate-900 mb-3 tracking-[-0.02em] stagger-2">
            Set up your store
          </h1>
          <p className="text-[17px] md:text-[19px] text-slate-500 font-medium stagger-3">
            Let's personalize your billing experience.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-[10px] text-[13px] font-medium border border-red-100 stagger-3">
            {error}
          </div>
        )}

        <form onSubmit={handleContinue} className="space-y-8 flex-1 flex flex-col w-full max-w-[360px] stagger-4">
          <div>
            <label htmlFor="storeName" className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-[0.1em]">
              Store name
            </label>
            <div className={`relative transition-all duration-300 rounded-xl ${isFocused ? 'ring-[3px] ring-indigo-500/20 shadow-sm' : ''}`}>
              <Input
                id="storeName"
                type="text"
                value={storeName}
                onChange={(e: any) => setStoreName(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isSaving}
                className="w-full text-[17px] p-[18px] h-auto bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-0 transition-colors placeholder:text-slate-300 shadow-sm"
                placeholder="e.g. Acme Coffee"
                required
                maxLength={50}
                autoFocus
              />
            </div>
            <p className="mt-3 text-[13px] font-medium text-slate-400">
              Your store name will appear on receipts.
            </p>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={isSaving || !storeName.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 active:scale-[0.98] text-white rounded-[10px] py-[22px] text-[15px] font-semibold transition-all duration-200 flex items-center justify-center group"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : null}
              Continue
              <span className="ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
            </Button>
          </div>
        </form>
      </div>

      {/* Right Decorative Artwork Side - Elegant Receipt Preview */}
      <div className="hidden md:flex flex-1 h-full items-center justify-center relative p-12 lg:p-24 pointer-events-none stagger-5">

        {/* Soft Ambient Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-slate-200/50 blur-[100px] rounded-full mix-blend-multiply" />

        <div className="relative z-10 w-full max-w-[280px] bg-white rounded-t-sm shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] overflow-hidden border border-slate-100/50 flex flex-col">
          {/* Jagged Receipt Bottom */}
          <div className="absolute bottom-0 inset-x-0 h-[6px] bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,#fdfcfb_4px,#fdfcfb_8px)]" />

          <div className="p-8 pb-12 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Store className="w-6 h-6 text-slate-400" />
            </div>

            <h2 className="text-[18px] font-bold text-slate-800 mb-1 font-mono tracking-tight max-w-full break-words">
              {displayName}
            </h2>

            <div className="text-[11px] text-slate-400 font-mono uppercase tracking-widest mb-6">
              Receipt Preview
            </div>

            {/* Faux Receipt Items */}
            <div className="w-full space-y-3 border-y border-dashed border-slate-200 py-4 mb-4">
              <div className="flex justify-between items-center w-full">
                <div className="w-24 h-2 bg-slate-100 rounded" />
                <div className="w-10 h-2 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between items-center w-full">
                <div className="w-16 h-2 bg-slate-100 rounded" />
                <div className="w-10 h-2 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between items-center w-full">
                <div className="w-20 h-2 bg-slate-100 rounded" />
                <div className="w-12 h-2 bg-slate-200 rounded" />
              </div>
            </div>

            <div className="w-full flex justify-between items-center">
              <div className="w-12 h-3 bg-slate-200 rounded" />
              <div className="w-16 h-3 bg-slate-800 rounded" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
