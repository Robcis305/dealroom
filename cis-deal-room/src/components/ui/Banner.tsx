'use client';

import { clsx } from 'clsx';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

type BannerVariant = 'warning' | 'danger' | 'info';

interface BannerProps {
  variant?: BannerVariant;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

const VARIANT_STYLES: Record<BannerVariant, { bg: string; text: string; icon: React.ElementType }> = {
  warning: { bg: 'bg-warning-subtle', text: 'text-warning', icon: AlertTriangle },
  danger: { bg: 'bg-danger-subtle', text: 'text-danger', icon: AlertCircle },
  info: { bg: 'bg-accent-subtle', text: 'text-accent', icon: Info },
};

export function Banner({ variant = 'warning', children, action }: BannerProps) {
  const { bg, text, icon: Icon } = VARIANT_STYLES[variant];

  return (
    <div className={clsx('flex items-center gap-3 px-4 py-2.5 border-b border-border', bg)}>
      <Icon size={16} className={text} />
      <div className={clsx('flex-1 text-sm', text)}>{children}</div>
      {action && (
        <button
          onClick={action.onClick}
          className={clsx('text-sm font-medium underline hover:no-underline', text)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
