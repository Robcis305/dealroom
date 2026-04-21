'use client';

import { useState } from 'react';
import { Check, XCircle, MinusCircle, RotateCcw, CircleDashed, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistStatus } from '@/types';

const CHIP: Record<ChecklistStatus, { label: string; icon: React.ReactNode; className: string }> = {
  not_started:  { label: 'Not Started', icon: <CircleDashed size={12} />, className: 'bg-surface-elevated text-text-muted' },
  in_progress:  { label: 'In Progress', icon: <Clock size={12} />, className: 'bg-accent-subtle text-accent-on-subtle' },
  received:     { label: 'Received',    icon: <Check size={12} />, className: 'bg-emerald-950 text-emerald-300 border border-emerald-800' },
  waived:       { label: 'Waived',      icon: <XCircle size={12} />, className: 'bg-amber-950 text-amber-300 border border-amber-800' },
  n_a:          { label: 'N/A',         icon: <MinusCircle size={12} />, className: 'bg-surface-elevated text-text-muted' },
};

interface Props {
  workspaceId: string;
  itemId: string;
  status: ChecklistStatus;
  isAdmin: boolean;
  onChanged: () => void;
}

export function ChecklistStatusChip({ workspaceId, itemId, status, isAdmin, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const chip = CHIP[status];

  async function setStatus(target: ChecklistStatus | 'reset') {
    setOpen(false);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/items/${itemId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      },
    );
    if (!res.ok) {
      toast.error('Failed to update status');
      return;
    }
    onChanged();
  }

  const chipNode = (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${chip.className}`}>
      {chip.icon}
      {chip.label}
    </span>
  );

  if (!isAdmin) return chipNode;

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent rounded">
        {chipNode}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[140px]">
            {(['received', 'waived', 'n_a'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setStatus(t)}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated cursor-pointer flex items-center gap-2"
              >
                {CHIP[t].icon}
                Mark {CHIP[t].label}
              </button>
            ))}
            <div className="border-t border-border-subtle">
              <button
                onClick={() => setStatus('reset')}
                className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer flex items-center gap-2"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
