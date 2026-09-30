import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = true, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    
    const baseInputStyles = 'border rounded-md px-3 py-2 bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:border-transparent placeholder-slate-400 disabled:opacity-50 disabled:bg-slate-50';
    const errorStyles = error ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]' : 'border-[var(--color-border)]';
    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <div className={`${widthStyles} flex flex-col gap-1`}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-text-primary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${baseInputStyles} ${errorStyles} ${widthStyles} ${className}`}
          {...props}
        />
        {error && (
          <span className="text-sm text-[var(--color-danger)] mt-0.5 font-medium">{error}</span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
