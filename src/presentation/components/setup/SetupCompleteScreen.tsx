import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Check, Loader2, Zap, Package, WifiOff } from 'lucide-react';
import { useSetupStore } from '../../../application/state/setupStore';
import { useSettingsStore } from '../../../application/state/settingsStore';

export const SetupCompleteScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { completeSetup } = useSetupStore();
  const { settings, loadSettings } = useSettingsStore();
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleComplete = async () => {
    setIsCompleting(true);
    const success = await completeSetup();
    setIsCompleting(false);
    if (!success) {
      setError('Failed to mark setup as complete. Please try again.');
    } else {
      onNext();
    }
  };

  const storeName = settings?.store?.shopName || 'Your Store';

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 relative overflow-hidden">
      
      {/* Background Glows for Success */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 blur-[120px] rounded-full mix-blend-multiply pointer-events-none opacity-0 animate-[fade-in_2s_ease-out_0.5s_forwards]" />

      <div className="flex flex-col items-center z-10 w-full max-w-[420px]">
        
        {/* Luminous Success Ring & Checkmark */}
        <div className="mb-10 flex justify-center relative stagger-1">
          <div className="absolute inset-0 bg-emerald-400 rounded-full scale-[2] opacity-0 animate-[pulse-ring_2s_cubic-bezier(0.215,0.61,0.355,1)_0.2s_forwards]" />
          <div className="w-24 h-24 bg-gradient-to-b from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center relative z-10 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] border border-emerald-300">
            <Check className="w-12 h-12 text-white" strokeWidth={3} />
          </div>
        </div>
        
        <h1 className="text-[42px] leading-[1.1] font-semibold text-slate-900 mb-2 tracking-[-0.02em] stagger-2">
          You're all set.
        </h1>

        <div className="text-[22px] text-slate-900 font-medium mb-12 stagger-3">
          {storeName}
        </div>
        
        <p className="text-[13px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-10 stagger-4">
          Mini POS is ready.
        </p>

        {error && (
          <div className="mb-8 w-full p-4 bg-red-50 text-red-700 rounded-[10px] text-[13px] font-medium border border-red-100 stagger-5">
            {error}
          </div>
        )}

        <div className="w-full stagger-5 mb-16">
          <Button 
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 hover:-translate-y-[1px] hover:shadow-lg active:translate-y-0 active:scale-[0.98] text-white rounded-[10px] py-[24px] text-[16px] font-semibold transition-all duration-200 flex items-center justify-center group"
          >
            {isCompleting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            Open Mini POS
            <span className="ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
          </Button>
        </div>

        {/* Capability Hints */}
        <div className="flex w-full justify-between items-center px-4 stagger-6 opacity-0">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
              <Zap className="w-4 h-4 text-indigo-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-500 text-center leading-tight">Start Billing<br/>Immediately</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
              <Package className="w-4 h-4 text-indigo-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-500 text-center leading-tight">Manage<br/>Inventory</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
              <WifiOff className="w-4 h-4 text-indigo-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-500 text-center leading-tight">Works<br/>Offline</span>
          </div>
        </div>

      </div>
    </div>
  );
};
