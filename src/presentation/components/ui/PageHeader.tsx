import React from 'react';

interface PageHeaderProps {
  title: string;
  action?: React.ReactNode;
  onClose?: () => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, action, onClose }) => {
  return (
    <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-panel)] shrink-0">
      <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
        {title}
      </h1>
      <div className="flex items-center gap-3">
        {action}
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-slate-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
            title="Close (Esc)"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
