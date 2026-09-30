import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'neutral' | 'brand';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold';
  
  const variants = {
    success: 'bg-[var(--color-success-light)] text-[var(--color-success)]',
    danger: 'bg-[var(--color-danger-light)] text-[var(--color-danger)]',
    neutral: 'bg-slate-100 text-slate-700',
    brand: 'bg-[var(--color-brand-light)] text-[var(--color-brand)]'
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};
