'use client';

import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ChecklistImportModal } from './ChecklistImportModal';
import { ChecklistTable } from './ChecklistTable';
import type { ChecklistItemRow } from './ChecklistTable';
import { PlaybookChecklistView } from './PlaybookChecklistView';

export type { ChecklistItemRow };

import type { DealKillerGroup } from '@/types';

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onChanged?: () => void;
  onUploadForItem: (folderId: string | null, itemId: string, itemName: string) => void;
  folders: Array<{ id: string; name: string }>;
  highlightGroup?: DealKillerGroup | null;
  onHighlightConsumed?: () => void;
}

interface PlaybookView {
  canonical: Array<unknown>;
  custom: Array<unknown>;
}

export function ChecklistView({ workspaceId, isAdmin, onChanged, onUploadForItem, folders, highlightGroup, onHighlightConsumed }: Props) {
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<{ id: string; name: string } | null>(null);
  const [playbook, setPlaybook] = useState<PlaybookView | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [showImport, setShowImport] = useState(false);

  const refresh = useCallback(async () => {
    // Don't toggle `loading` here — that unmounts the playbook view and resets scroll.
    // Only the initial mount sets loading=true; from then on, just swap data in place.
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/checklist`);
    if (res.ok) {
      const data = await res.json();
      setChecklist(data.checklist);
      setPlaybook(data.playbook ?? null);
      setItems(data.items ?? []);
    }
    setLoading(false);  // first call also clears the initial-mount loading state
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

  if (playbook) {
    return (
      <PlaybookChecklistView
        workspaceId={workspaceId}
        isAdmin={isAdmin}
        canonical={playbook.canonical as never}
        custom={playbook.custom as never}
        folders={folders}
        onChanged={() => { refresh(); onChanged?.(); }}
        onUploadForItem={(itemId, name) => onUploadForItem(null, itemId, name)}
        highlightGroup={highlightGroup}
        onHighlightConsumed={onHighlightConsumed}
      />
    );
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
