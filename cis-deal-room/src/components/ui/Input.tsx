import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={twMerge(
            clsx(
              'w-full bg-surface-sunken border border-border text-text-primary',
              'placeholder:text-text-muted px-3 py-2 rounded-lg text-sm font-sans',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
              'transition-colors duration-150',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              error && 'border-error focus:ring-error',
              className
            )
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
