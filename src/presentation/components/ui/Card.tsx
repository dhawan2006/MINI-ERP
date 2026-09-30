import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-[var(--color-bg-panel)] rounded-lg border border-[var(--color-border)] shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
};
