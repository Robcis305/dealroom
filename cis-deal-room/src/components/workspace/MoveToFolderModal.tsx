'use client';

import { useState } from 'react';
import { Folder, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface FolderRef {
  id: string;
  name: string;
}

interface MoveToFolderModalProps {
  open: boolean;
  onClose: () => void;
  fileIds: string[];
  currentFolderId: string;
  folders: FolderRef[];
  onMoved: () => void;
}

/**
 * UI is live; the server endpoint (POST /api/files/move) is currently stubbed.
 * When the endpoint returns 200 with `{ moved: [...] }`, the UI will update cleanly.
 * Until then, the stub responds with 501 and the user sees a "coming soon" toast.
 */
export function MoveToFolderModal({
  open,
  onClose,
  fileIds,
  currentFolderId,
  folders,
  onMoved,
}: MoveToFolderModalProps) {
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const destinations = folders.filter((f) => f.id !== currentFolderId);

  async function handleMove(folderId: string) {
    setMovingTo(folderId);
    try {
      const res = await fetchWithAuth('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds, destinationFolderId: folderId }),
      });

      if (res.status === 501) {
        toast.info('Move coming soon', {
          description: 'The move endpoint isn\'t wired yet. Your selection is unchanged.',
        });
        return;
      }

      if (res.ok) {
        const target = folders.find((f) => f.id === folderId);
        toast.success(`${fileIds.length} file${fileIds.length === 1 ? '' : 's'} moved to ${target?.name}`);
        onMoved();
        onClose();
      } else {
        toast.error('Failed to move files');
      }
    } catch {
      toast.error('Failed to move files');
    } finally {
      setMovingTo(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move to folder">
      <p className="text-sm text-text-secondary mb-4">
        Moving {fileIds.length} file{fileIds.length === 1 ? '' : 's'}. Choose a destination.
      </p>

      {destinations.length === 0 ? (
        <p className="text-sm text-text-muted py-4 text-center">
          No other folders in this workspace.
        </p>
      ) : (
        <ul className="space-y-1 max-h-80 overflow-y-auto -mx-2 px-2">
          {destinations.map((f) => {
            const busy = movingTo === f.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => handleMove(f.id)}
                  disabled={movingTo !== null}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
                    text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated
                    transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Folder size={14} className="shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left truncate">{f.name}</span>
                  {busy ? (
                    <Loader2 size={14} className="animate-spin text-text-muted" aria-hidden="true" />
                  ) : (
                    <ArrowRight size={14} className="text-text-muted" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={movingTo !== null}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
