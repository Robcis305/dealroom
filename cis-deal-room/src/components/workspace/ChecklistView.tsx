'use client';

import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ChecklistImportModal } from './ChecklistImportModal';
import type { ChecklistPriority, ChecklistOwner, ChecklistStatus } from '@/types';

export interface ChecklistItemRow {
  id: string;
  sortOrder: number;
  category: string;
  folderId: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  status: ChecklistStatus;
  notes: string | null;
  requestedAt: string;
  receivedAt: string | null;
}

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onChanged?: () => void;
}

export function ChecklistView({ workspaceId, isAdmin, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [showImport, setShowImport] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/checklist`);
    if (res.ok) {
      const data = await res.json();
      setChecklist(data.checklist);
      setItems(data.items);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="p-8 text-text-muted">Loading…</div>;

  if (!checklist) {
    if (isAdmin) {
      return (
        <div className="p-8 max-w-xl">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList size={32} className="text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Import diligence checklist</h2>
            <p className="text-sm text-text-secondary">
              Upload an .xlsx of requested diligence items to track progress and let
              participants upload against each request.
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-inverse
                text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Upload size={14} />
              Import checklist
            </button>
          </div>
          {showImport && (
            <ChecklistImportModal
              workspaceId={workspaceId}
              onClose={() => setShowImport(false)}
              onImported={() => {
                setShowImport(false);
                refresh();
                onChanged?.();
              }}
            />
          )}
        </div>
      );
    }
    return <div className="p-8 text-text-muted text-sm">No checklist yet.</div>;
  }

  // Table — implemented in Task 24. For now, render a compact stub showing item count
  // so the view is visibly populated after import. Task 24 replaces this with the real table.
  return (
    <div className="p-8">
      <h2 className="text-lg font-semibold text-text-primary mb-4">{checklist.name}</h2>
      <p className="text-sm text-text-muted">
        {items.length} item{items.length === 1 ? '' : 's'} — table view coming in next task.
      </p>
    </div>
  );
}
