import React from 'react';
import { ActivationForm } from '../licensing/ActivationScreen';
import { ShieldCheck, Lock, Key } from 'lucide-react';

export const SetupActivationScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  return (
    <div className="w-full h-full flex items-center justify-center max-w-[1200px] mx-auto">

      {/* Left Content Side */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 relative z-10 w-full max-w-[580px]">

        <div className="mb-8 stagger-1">
          <h1 className="text-[36px] md:text-[42px] font-semibold text-slate-900 mb-3 tracking-[-0.02em]">
            Almost ready
          </h1>
          <p className="text-[17px] md:text-[19px] text-slate-500 font-medium max-w-[320px]">
            Your store is configured. Activate Mini POS to start billing.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200/60 p-7 w-full max-w-[400px] stagger-2">
          <div className="flex items-center space-x-4 mb-8 pb-6 border-b border-slate-100">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">Secure Activation</h2>
              <p className="text-[13px] text-slate-500 font-medium mt-0.5">Device license required</p>
            </div>
          </div>

          <div className="activation-form-wrapper">
            <ActivationForm onSuccess={onNext} />
          </div>

          <div className="mt-6 flex items-center justify-center space-x-2 text-slate-400">
            <Lock className="w-3 h-3" />
            <span className="text-[11px] font-medium tracking-wide">Securely linked to this device.</span>
          </div>
        </div>

      </div>

      {/* Right Decorative Artwork Side */}
      <div className="hidden md:flex flex-1 h-full items-center justify-center relative p-12 lg:p-24 overflow-hidden pointer-events-none stagger-3">

        {/* Ambient Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 blur-[100px] rounded-full mix-blend-multiply" />
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-purple-500/10 blur-[80px] rounded-full mix-blend-multiply" />

        {/* Abstract Security Visual */}
        <div className="relative w-full h-[500px] flex items-center justify-center">

          {/* Main Shield Plate */}
          <div className="absolute z-10 w-[240px] h-[240px] bg-white/60 backdrop-blur-xl border border-white/80 rounded-[40px] shadow-[0_20px_40px_-15px_rgba(79,70,229,0.15)] flex flex-col items-center justify-center p-6 transform rotate-3">
            <div className="w-24 h-24 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 relative">
              <div className="absolute inset-0 rounded-full border border-indigo-200 animate-ping opacity-20" style={{ animationDuration: '3s' }} />
              <ShieldCheck className="w-10 h-10 text-indigo-600 opacity-80" />
            </div>
            <div className="w-20 h-2 rounded-full bg-slate-200 mb-2" />
            <div className="w-12 h-2 rounded-full bg-slate-100" />
          </div>

          {/* Orbiting Key Element */}
          <div className="absolute z-20 top-[20%] right-[20%] w-16 h-16 bg-white/80 backdrop-blur-md border border-white rounded-2xl shadow-lg flex items-center justify-center transform -rotate-12">
            <Key className="w-6 h-6 text-purple-500 opacity-80" />
          </div>

          {/* Secure Node Element */}
          <div className="absolute z-0 bottom-[20%] left-[15%] w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[20px] shadow-lg transform rotate-6 opacity-90 flex items-center justify-center">
            <Lock className="w-7 h-7 text-white/80" />
          </div>

        </div>
      </div>

    </div>
  );
};
