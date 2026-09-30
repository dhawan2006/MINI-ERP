import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth = false, className = '', children, disabled, ...props }, ref) => {
    
    let baseStyles = 'inline-flex items-center justify-center font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
    
    let variants = {
      primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] focus:ring-[var(--color-focus-ring)] shadow-sm',
      secondary: 'bg-white text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-slate-50 focus:ring-[var(--color-focus-ring)] shadow-sm',
      danger: 'bg-[var(--color-danger)] text-white hover:bg-red-600 focus:ring-red-500 shadow-sm',
      ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:bg-slate-100 hover:text-[var(--color-text-primary)] focus:ring-[var(--color-focus-ring)]'
    };

    let sizes = {
      sm: 'px-3 py-1.5 text-sm rounded',
      md: 'px-4 py-2 text-base rounded-md',
      lg: 'px-6 py-3 text-lg rounded-lg'
    };

    const classes = [
      baseStyles,
      variants[variant],
      sizes[size],
      fullWidth ? 'w-full' : '',
      className
    ].filter(Boolean).join(' ');

    return (
      <button ref={ref} className={classes} disabled={disabled} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
