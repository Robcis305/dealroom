'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistPriority, ChecklistOwner, PlaybookCategory } from '@/types';
import type { ChecklistItemRow } from './ChecklistTable';

type Mode = 'edit' | 'create';

interface BaseProps {
  workspaceId: string;
  folders: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

interface EditProps extends BaseProps {
  mode: 'edit';
  item: ChecklistItemRow;
  defaultCategory?: never;
}

interface CreateProps extends BaseProps {
  mode: 'create';
  item?: never;
  defaultCategory?: PlaybookCategory;
}

type Props = EditProps | CreateProps;

const PRIORITY_OPTIONS: ChecklistPriority[] = ['critical', 'high', 'medium', 'low'];
const OWNER_OPTIONS: ChecklistOwner[] = ['unassigned', 'seller', 'buyer', 'both', 'cis_team'];

const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const OWNER_LABEL: Record<ChecklistOwner, string> = {
  unassigned: 'Unassigned', seller: 'Seller', buyer: 'Buyer', both: 'Both', cis_team: 'CIS Team',
};

const CATEGORY_OPTIONS: Array<{ value: PlaybookCategory; label: string }> = [
  { value: 'corporate_legal', label: 'Corporate & Legal' },
  { value: 'financial', label: 'Financial' },
  { value: 'commercial', label: 'Commercial & Customer' },
  { value: 'team_hr', label: 'Team & HR' },
  { value: 'ip_technical', label: 'IP & Technical' },
  { value: 'operations_risk', label: 'Operations & Risk' },
];

export function ChecklistItemEditModal(props: Props) {
  const { workspaceId, folders, onClose, onSaved } = props;
  const isEdit = props.mode === 'edit';

  const [name, setName] = useState(isEdit ? props.item.name : '');
  const [description, setDescription] = useState(isEdit ? (props.item.description ?? '') : '');
  const [category, setCategory] = useState<string>(
    isEdit ? props.item.category : (props.defaultCategory ?? 'corporate_legal'),
  );
  const [priority, setPriority] = useState<ChecklistPriority>(
    isEdit ? props.item.priority : 'medium',
  );
  const [owner, setOwner] = useState<ChecklistOwner>(
    isEdit ? props.item.owner : 'unassigned',
  );
  const [folderId, setFolderId] = useState<string>(
    isEdit ? props.item.folderId : (folders[0]?.id ?? ''),
  );
  const [notes, setNotes] = useState(isEdit ? (props.item.notes ?? '') : '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !category.trim()) {
      toast.error('Name and Category are required');
      return;
    }
    if (isEdit && !folderId) {
      toast.error('Folder is required');
      return;
    }
    setSubmitting(true);

    if (isEdit) {
      const res = await fetchWithAuth(
        `/api/workspaces/${workspaceId}/checklist/items/${props.item.id}`,
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
      if (!res.ok) { toast.error('Failed to save'); return; }
      toast.success('Item updated');
    } else {
      const res = await fetchWithAuth(
        `/api/workspaces/${workspaceId}/checklist/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            category: category.trim(),
            priority,
            owner,
            folderId: folderId || null,
            notes: notes.trim() || null,
          }),
        },
      );
      setSubmitting(false);
      if (!res.ok) { toast.error('Failed to create item'); return; }
      toast.success('Custom item added');
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl max-w-xl w-full p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {isEdit ? 'Edit checklist item' : 'Add custom item'}
        </h2>
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
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              required
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Folder {!isEdit && <span className="text-text-muted font-normal">(optional)</span>}
            </label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-text-primary"
              required={isEdit}
            >
              {!isEdit && <option value="">— none —</option>}
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
              {submitting ? 'Saving…' : (isEdit ? 'Save' : 'Add item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
