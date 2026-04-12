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
    'bg-[#E10600] hover:bg-[#C40500] text-white ' +
    'focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-[#0D0D0D]',
  ghost:
    'bg-transparent hover:bg-[#1F1F1F] text-neutral-300 hover:text-white ' +
    'border border-[#2A2A2A] hover:border-[#3A3A3A] ' +
    'focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-[#0D0D0D]',
  destructive:
    'bg-[#E10600]/10 hover:bg-[#E10600]/20 text-[#E10600] hover:text-[#FF1A17] ' +
    'border border-[#E10600]/20 ' +
    'focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-[#0D0D0D]',
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
