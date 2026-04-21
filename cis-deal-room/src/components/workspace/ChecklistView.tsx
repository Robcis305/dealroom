'use client';

import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ChecklistImportModal } from './ChecklistImportModal';
import { ChecklistTable } from './ChecklistTable';
import type { ChecklistItemRow } from './ChecklistTable';

export type { ChecklistItemRow };

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onChanged?: () => void;
  onUploadForItem: (folderId: string, itemId: string, itemName: string) => void;
  folders: Array<{ id: string; name: string }>;
}

export function ChecklistView({ workspaceId, isAdmin, onChanged, onUploadForItem, folders }: Props) {
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

  return (
    <div>
      <div className="px-8 pt-6 pb-2">
        <h2 className="text-lg font-semibold text-text-primary">{checklist.name}</h2>
      </div>
      <ChecklistTable
        workspaceId={workspaceId}
        items={items}
        isAdmin={isAdmin}
        onChanged={() => { refresh(); onChanged?.(); }}
        onUploadForItem={(item) => onUploadForItem(item.folderId, item.id, item.name)}
        folders={folders}
      />
    </div>
  );
}
