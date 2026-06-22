'use client';
import { Check, Clock } from 'lucide-react';
import clsx from 'clsx';
import type { QnaStatus } from '@/types';
import { QNA_STATUS_LABEL } from '@/lib/qna/constants';

const STYLE: Record<QnaStatus, string> = {
  new: 'bg-surface-elevated text-text-muted',
  assigned: 'bg-surface-elevated text-text-secondary',
  answered: 'bg-surface-elevated text-text-primary',
  approved: 'bg-text-primary text-surface',
};

export function QnaStatusChip({ status, overdue }: { status: QnaStatus; overdue?: boolean }) {
  if (overdue && status !== 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: '#FBE5E4', color: '#C8281F' }}>
        <Clock size={11} /> Overdue
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', STYLE[status])}>
      {status === 'approved' && <Check size={11} />}
      {QNA_STATUS_LABEL[status]}
    </span>
  );
}
