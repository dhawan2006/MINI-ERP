import React from 'react';
import { Button } from '../ui/Button';
import posImage from '../../assets/setup/pos.jpg';

export const WelcomeScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  return (
    <div className="w-full h-full flex items-center justify-center max-w-[1200px] mx-auto">
      
      {/* Left Content Side */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 relative z-10 w-full max-w-[580px]">
        {/* Brand Mark */}
        <div className="w-12 h-12 bg-indigo-600 rounded-xl shadow-sm mb-6 flex items-center justify-center stagger-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent" />
          <span className="text-white font-bold text-xl tracking-tighter">M</span>
        </div>

        <div className="mb-6 text-indigo-600/80 text-[11px] font-bold tracking-[0.2em] uppercase stagger-1">
          MINI POS
        </div>
        
        <h1 className="text-[36px] md:text-[42px] leading-[1.1] font-semibold text-slate-900 mb-5 tracking-[-0.02em] stagger-2">
          Welcome to Mini POS
        </h1>
        
        <p className="text-[17px] md:text-[19px] leading-[1.5] text-slate-500 mb-10 font-medium stagger-3 max-w-[320px]">
          Fast billing.<br/>Simple inventory.<br/>Works even offline.
        </p>

        <div className="w-full stagger-4 max-w-[320px]">
          <Button 
            onClick={onNext}
            className="w-full bg-slate-900 hover:bg-slate-800 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 active:scale-[0.98] text-white rounded-[10px] py-[22px] text-[15px] font-semibold transition-all duration-200"
          >
            Get Started
          </Button>
        </div>

        <p className="mt-8 text-[13px] font-medium text-slate-400 stagger-5">
          Your data stays on this device.
        </p>
      </div>

      {/* Right Decorative Artwork Side */}
      <div className="hidden md:flex flex-[1.2] h-full items-center justify-center relative p-8 lg:p-12 pointer-events-none stagger-5">
        <div className="relative w-full max-w-[800px] flex items-center justify-center">
          <img 
            src={posImage} 
            alt="Mini POS 3D Scene" 
            className="w-full h-auto object-cover object-center rounded-3xl"
            style={{ 
              maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'
            }}
          />
        </div>
      </div>

    </div>
  );
};
