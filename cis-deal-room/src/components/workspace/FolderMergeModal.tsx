'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Folder {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  source: Folder;
  targets: Folder[];
  onClose: () => void;
  onMerged: () => void;
}

export function FolderMergeModal({ workspaceId, source, targets, onClose, onMerged }: Props) {
  const [targetId, setTargetId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  async function handleMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setSubmitting(true);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/folders/${source.id}/merge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFolderId: targetId }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Merge failed');
      return;
    }
    const result = (await res.json()) as { fileCount: number; itemCount: number };
    const moved: string[] = [];
    if (result.fileCount > 0) moved.push(`${result.fileCount} file${result.fileCount === 1 ? '' : 's'}`);
    if (result.itemCount > 0) moved.push(`${result.itemCount} checklist item${result.itemCount === 1 ? '' : 's'}`);
    toast.success(
      moved.length > 0
        ? `Merged "${source.name}" into "${targets.find((t) => t.id === targetId)?.name ?? 'target'}" — moved ${moved.join(' and ')}.`
        : `Deleted empty folder "${source.name}".`,
    );
    onMerged();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form
        onSubmit={handleMerge}
        className="bg-surface border border-border rounded-xl max-w-md w-full p-6"
      >
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          Merge folder
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          All files and checklist items in{' '}
          <span className="text-text-primary font-medium">&ldquo;{source.name}&rdquo;</span>{' '}
          will be moved to the target folder. Then{' '}
          <span className="text-text-primary font-medium">&ldquo;{source.name}&rdquo;</span>{' '}
          will be deleted. This cannot be undone.
        </p>

        <label className="block text-xs font-medium text-text-secondary mb-1">
          Merge into
        </label>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-sm text-text-primary mb-5"
          required
          autoFocus
        >
          <option value="">Select a folder…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!targetId || submitting}
            className="bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </form>
    </div>
  );
}
