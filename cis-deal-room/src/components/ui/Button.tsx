import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent hover:bg-accent-hover text-text-inverse ' +
    'focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
  ghost:
    'bg-transparent hover:bg-surface-sunken text-text-primary hover:text-text-primary ' +
    'border border-border hover:border-border ' +
    'focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
  destructive:
    'bg-accent-subtle hover:bg-accent/20 text-accent hover:text-accent ' +
    'border border-accent/30 ' +
    'focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center rounded-lg font-medium',
            'transition-colors duration-150 cursor-pointer',
            'focus:outline-none',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            variantClasses[variant],
            sizeClasses[size],
            className
          )
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
