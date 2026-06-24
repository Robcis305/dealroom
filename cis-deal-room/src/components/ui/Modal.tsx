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
      className="fixed inset-0 bg-surface-sunken/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={twMerge(
          clsx(
            'bg-surface border border-border rounded-xl p-6 shadow-2xl',
            'w-full max-w-lg',
            'flex flex-col max-h-[90vh]',
            'max-sm:rounded-none max-sm:mx-0 max-sm:min-h-screen max-sm:max-h-screen max-sm:max-w-none',
            'transition-all duration-200',
            className
          )
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-accent rounded"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {/* Scrollable body: children that mark sections shrink-0 (header/footer)
            stay pinned while a flex-1 section scrolls. Plain content just scrolls.
            px-2 -mx-2: overflow-y forces horizontal clipping, which would cut off
            focus rings/outlines on edge elements — the padding moves the clip
            boundary outward without shifting content. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-2 -mx-2">{children}</div>
      </div>
    </div>
  );
}
