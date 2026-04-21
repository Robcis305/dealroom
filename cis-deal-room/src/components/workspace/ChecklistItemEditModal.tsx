'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistPriority, ChecklistOwner } from '@/types';
import type { ChecklistItemRow } from './ChecklistTable';

interface Props {
  workspaceId: string;
  item: ChecklistItemRow;
  folders: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITY_OPTIONS: ChecklistPriority[] = ['critical', 'high', 'medium', 'low'];
const OWNER_OPTIONS: ChecklistOwner[] = ['unassigned', 'seller', 'buyer', 'both', 'cis_team'];

const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const OWNER_LABEL: Record<ChecklistOwner, string> = {
  unassigned: 'Unassigned', seller: 'Seller', buyer: 'Buyer', both: 'Both', cis_team: 'CIS Team',
};

export function ChecklistItemEditModal({ workspaceId, item, folders, onClose, onSaved }: Props) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [category, setCategory] = useState(item.category);
  const [priority, setPriority] = useState<ChecklistPriority>(item.priority);
  const [owner, setOwner] = useState<ChecklistOwner>(item.owner);
  const [folderId, setFolderId] = useState(item.folderId);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !category.trim() || !folderId) {
      toast.error('Name, Category, and Folder are required');
      return;
    }
    setSubmitting(true);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/items/${item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim(),
          priority,
          owner,
          folderId,
          notes: notes.trim() || null,
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      toast.error('Failed to save');
      return;
    }
    toast.success('Item updated');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl max-w-xl w-full p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Edit checklist item</h2>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Folder</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              required
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ChecklistPriority)}
                className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Owner</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value as ChecklistOwner)}
                className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              >
                {OWNER_OPTIONS.map((o) => (
                  <option key={o} value={o}>{OWNER_LABEL[o]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Notes (admin-visible)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent hover:bg-accent-hover text-text-inverse
                text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
