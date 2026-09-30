import React from 'react';

interface KeyboardHintProps {
  shortcut: string;
  label?: string;
  className?: string;
}

export const KeyboardHint: React.FC<KeyboardHintProps> = ({ shortcut, label, className = '' }) => {
  return (
    <div className={`flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] ${className}`}>
      {label && <span>{label}</span>}
      <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded">
        {shortcut}
      </kbd>
    </div>
  );
};
