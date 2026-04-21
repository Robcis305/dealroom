'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

const UNDO_WINDOW_MS = 10_000;

/**
 * Client-side soft-delete with undo window.
 *
 * Flow:
 *   1. Caller removes the item from local state immediately (optimistic).
 *   2. softDelete() shows an "Undo" toast and schedules the real API call for 10s later.
 *   3. If the user clicks Undo, the timer is cancelled and onRestore() is invoked.
 *   4. Otherwise, after 10s the real DELETE call fires; on server failure onRestore() runs.
 *
 * Limitation: if the browser tab closes during the 10s window, the server-side delete
 * does not happen. That errs on the safe side (item still exists) which is the correct
 * failure mode for destructive actions in a data room.
 */
export function useSoftDelete() {
  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return useCallback(function softDelete(params: {
    id: string;
    label: string;
    onRestore: () => void;
    performDelete: () => Promise<boolean>;
  }) {
    const { id, label, onRestore, performDelete } = params;

    // Cancel any existing timer for this id (shouldn't happen, but be safe)
    const existing = pending.current.get(id);
    if (existing) clearTimeout(existing);

    const toastId = toast(`${label} deleted`, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const t = pending.current.get(id);
          if (t) {
            clearTimeout(t);
            pending.current.delete(id);
          }
          onRestore();
        },
      },
    });

    const timer = setTimeout(async () => {
      pending.current.delete(id);
      try {
        const ok = await performDelete();
        if (!ok) {
          toast.error(`Failed to delete ${label} — restored`, { id: toastId });
          onRestore();
        }
      } catch {
        toast.error(`Failed to delete ${label} — restored`, { id: toastId });
        onRestore();
      }
    }, UNDO_WINDOW_MS);

    pending.current.set(id, timer);
  }, []);
}
