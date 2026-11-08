import React, { useState } from 'react';
import { useSetupStore } from '../../application/state/setupStore';
import { Loader2 } from 'lucide-react';
import { WelcomeScreen } from '../components/setup/WelcomeScreen';
import { StoreSetupScreen } from '../components/setup/StoreSetupScreen';
import { SetupCompleteScreen } from '../components/setup/SetupCompleteScreen';


export function SetupLayout({ onSetupComplete }: { onSetupComplete: () => void }) {
  const { state, isInitializing } = useSetupStore();
  const [currentStep, setCurrentStep] = useState<'WELCOME' | 'STORE' | 'COMPLETE'>('WELCOME');
  const [direction, setDirection] = useState<'enter' | 'exit'>('enter');

  if (isInitializing) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#fdfcfc] text-slate-900">
        <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
      </div>
    );
  }

  React.useEffect(() => {
    if (state?.status === 'IN_PROGRESS' && currentStep === 'WELCOME') {
      setCurrentStep('STORE');
    }
  }, [state?.status, currentStep]);

  const navigateTo = (nextStep: typeof currentStep) => {
    setDirection('exit');
    setTimeout(() => {
      setCurrentStep(nextStep);
      setDirection('enter');
    }, 400); // 400ms exit animation
  };

  const handleWelcomeNext = () => navigateTo('STORE');
  const handleStoreNext = () => navigateTo('COMPLETE');

  const stepIndex = {
    'WELCOME': 0,
    'STORE': 1,
    'COMPLETE': 2
  }[currentStep];

  return (
    <div className="h-screen w-full ambient-bg font-sans text-slate-900 selection:bg-indigo-100/50 flex flex-col overflow-hidden relative">
      
      {/* Elegant Progress Indicator */}
      {currentStep !== 'COMPLETE' && (
        <div className="absolute top-10 left-0 w-full flex justify-center z-50">
          <div className="flex items-center space-x-3 text-slate-300">
            {[0, 1].map((i) => (
              <React.Fragment key={i}>
                <div className={`w-2 h-2 rounded-full transition-all duration-700 ${stepIndex >= i ? 'bg-indigo-600' : 'border border-slate-300'}`} />
                {i < 1 && (
                  <div className="w-12 h-px bg-slate-200">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-700" 
                      style={{ width: stepIndex > i ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex h-full w-full transition-opacity duration-400 ${direction === 'exit' ? 'view-exit' : 'view-enter'}`}>
        {currentStep === 'WELCOME' && <WelcomeScreen onNext={handleWelcomeNext} />}
        {currentStep === 'STORE' && <StoreSetupScreen onNext={handleStoreNext} />}
        {currentStep === 'COMPLETE' && <SetupCompleteScreen onNext={onSetupComplete} />}
      </div>

      {/* Footer Signature */}
      <div className="absolute bottom-8 left-0 w-full flex justify-center z-50 pointer-events-none">
        <div className="text-[10px] font-bold tracking-[0.2em] text-slate-400/50 uppercase stagger-dev-signature opacity-0">
          Developed by Laksh
        </div>
      </div>
    </div>
  );
}
