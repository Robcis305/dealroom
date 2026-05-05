'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

const UNDO_WINDOW_MS = 10_000;

/**
 * Server-side soft-delete with undo window.
 *
 * Flow:
 *   1. Caller removes the item from local state immediately (optimistic).
 *   2. softDelete() fires the DELETE call; server soft-deletes (sets deleted_at).
 *   3. Toast appears with an "Undo" button. If clicked within 10s, fires /restore
 *      and the caller's onRestore() puts the item back into local state.
 *   4. After 10s, the toast disappears and the file remains soft-deleted on the
 *      server (still recoverable via API; UI no longer surfaces it).
 *
 * The server is the source of truth — closing the tab does NOT prevent the
 * delete (unlike the prior client-only implementation).
 */
export function useSoftDelete() {
  return useCallback(function softDelete(params: {
    id: string;
    label: string;
    onRestore: () => void;
    performDelete: () => Promise<boolean>;
    performRestore: () => Promise<boolean>;
  }) {
    const { id: _id, label, onRestore, performDelete, performRestore } = params;

    // Fire the soft-delete immediately.
    void (async () => {
      try {
        const ok = await performDelete();
        if (!ok) {
          toast.error(`Failed to delete ${label} — restored`);
          onRestore();
          return;
        }
        // Successful soft-delete — show undo affordance.
        toast(`${label} deleted`, {
          duration: UNDO_WINDOW_MS,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const restored = await performRestore();
                if (!restored) {
                  toast.error(`Couldn't restore ${label}`);
                  return;
                }
                onRestore();
              } catch {
                toast.error(`Couldn't restore ${label}`);
              }
            },
          },
        });
      } catch {
        toast.error(`Failed to delete ${label}`);
        onRestore();
      }
    })();
  }, []);
}
