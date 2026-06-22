'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { WorkstreamWithCounts } from '@/types';

interface Props {
  fileId: string;
  workstreams: WorkstreamWithCounts[];
  isAdmin: boolean;
  onChanged?: () => void;
}

export function FileWorkstreamTags({ fileId, workstreams, isAdmin, onChanged }: Props) {
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (workstreams.length === 0) return;
    const res = await fetchWithAuth(`/api/files/${fileId}/workstreams`);
    if (res.ok) {
      const { workstreamIds } = await res.json();
      setTagIds(new Set(workstreamIds));
    }
  }, [fileId, workstreams.length]);

  useEffect(() => { load(); }, [load]);

  async function toggle(id: string) {
    const next = new Set(tagIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTagIds(next);
    await fetchWithAuth(`/api/files/${fileId}/workstreams`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workstreamIds: [...next] }),
    });
    onChanged?.();
  }

  const active = workstreams.filter((w) => tagIds.has(w.id));

  if (workstreams.length === 0) return null;

  return (
    <div className="relative inline-flex items-center gap-1">
      <span className="flex items-center gap-1">
        {active.map((w) => (
          <span key={w.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} title={w.name} aria-label={w.name} />
        ))}
      </span>
      {isAdmin && (
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-text-muted hover:text-accent cursor-pointer px-1" aria-label="Edit workstream tags">
          {active.length === 0 ? 'Tag' : '·'}
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md min-w-[180px] p-1">
            {workstreams.map((w) => (
              <label key={w.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-surface-elevated cursor-pointer rounded">
                <input type="checkbox" checked={tagIds.has(w.id)} onChange={() => toggle(w.id)} className="accent-accent" />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
                <span className="text-text-primary">{w.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
