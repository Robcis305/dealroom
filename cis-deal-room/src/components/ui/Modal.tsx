'use client';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ReactNode, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={twMerge(
          clsx(
            'bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 shadow-2xl',
            'w-full max-w-lg mx-4',
            'transition-all duration-200',
            className
          )
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-[#E10600] rounded"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
