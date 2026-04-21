'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChecklistItemEditModal } from './ChecklistItemEditModal';
import type { ChecklistItemRow } from './ChecklistTable';

interface Props {
  workspaceId: string;
  item: ChecklistItemRow;
  folders: Array<{ id: string; name: string }>;
  onChanged: () => void;
}

export function ChecklistRowActions({ workspaceId, item, folders, onChanged }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setConfirmDelete(false);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/items/${item.id}`,
      { method: 'DELETE' },
    );
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Item deleted');
    onChanged();
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1 text-text-muted hover:text-text-primary rounded cursor-pointer"
          aria-label="Row actions"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[120px]">
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                className="w-full text-left px-3 py-2 text-xs text-accent hover:bg-accent-subtle/20 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <ChecklistItemEditModal
          workspaceId={workspaceId}
          item={item}
          folders={folders}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete checklist item"
        description={`Delete "${item.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="destructive"
      />
    </>
  );
}
