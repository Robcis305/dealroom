'use client';

import { useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistPriority, ChecklistOwner } from '@/types';
import type { FolderMatchKind } from '@/lib/checklist/folder-match';

interface Props {
  workspaceId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  sortOrder: number;
  category: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  notes: string | null;
  requestedAt: string | null;
}

interface FolderResolution {
  category: string;
  matchedFolderId: string | null;
  matchedFolderName: string | null;
  matchKind: FolderMatchKind;
}

interface PreviewPayload {
  valid: ParsedRow[];
  rejected: Array<{ rowNumber: number; reason: string }>;
  folderResolution: FolderResolution[];
  existingFolders: Array<{ id: string; name: string }>;
}

/** Sentinel for the "create new folder" dropdown choice. */
const CREATE_NEW = '__create_new__';

export function ChecklistImportModal({ workspaceId, onClose, onImported }: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  // category → folderId (existing) | CREATE_NEW
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const onDrop = async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/preview`,
      { method: 'POST', body: form },
    );
    if (!res.ok) {
      toast.error('Failed to parse file');
      return;
    }
    const data: PreviewPayload = await res.json();
    setPreview(data);

    // Seed mapping with auto-resolved defaults.
    const seeded: Record<string, string> = {};
    for (const r of data.folderResolution) {
      seeded[r.category] = r.matchedFolderId ?? CREATE_NEW;
    }
    setMapping(seeded);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  });

  // Split for display: auto-matched (exact or fuzzy) vs unmapped.
  const autoMatched = useMemo(
    () => preview?.folderResolution.filter((r) => r.matchKind !== 'none') ?? [],
    [preview],
  );
  const unmapped = useMemo(
    () => preview?.folderResolution.filter((r) => r.matchKind === 'none') ?? [],
    [preview],
  );

  async function handleConfirm() {
    if (!preview) return;
    setSubmitting(true);

    // Pass the final user-confirmed mapping to the server. Each entry is either
    // an existing folder UUID (map) or null (create a new folder for this
    // category). This lets the admin's choice override fuzzy auto-matches too.
    const folderMapping: Record<string, string | null> = {};
    for (const r of preview.folderResolution) {
      const chosen = mapping[r.category];
      folderMapping[r.category] = chosen === CREATE_NEW ? null : chosen;
    }

    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: preview.valid.map((r) => ({ ...r, requestedAt: r.requestedAt })),
          folderMapping,
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Import failed');
      return;
    }
    const data = await res.json();
    toast.success(`Imported ${data.itemCount} items`);
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Import checklist</h2>

        {!preview ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition
              ${isDragActive ? 'border-accent bg-accent-subtle/20' : 'border-border'}`}
          >
            <input {...getInputProps()} />
            <p className="text-sm text-text-secondary">
              Drop an .xlsx file here, or click to browse.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">{preview.valid.length}</strong> valid rows,{' '}
              <strong className={preview.rejected.length > 0 ? 'text-accent' : 'text-text-primary'}>
                {preview.rejected.length}
              </strong>{' '}
              rejected.
            </p>

            {preview.rejected.length > 0 && (
              <div className="border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  Rejected rows
                </p>
                <ul className="text-xs text-text-secondary space-y-1">
                  {preview.rejected.map((r) => (
                    <li key={r.rowNumber}>
                      Row {r.rowNumber}: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.folderResolution.length > 0 && (
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  Folder mapping
                </p>

                {unmapped.length > 0 && (
                  <>
                    <p className="text-xs text-text-secondary mb-2">
                      New categor{unmapped.length === 1 ? 'y' : 'ies'} — map to an existing folder, or create new.
                    </p>
                    <div className="space-y-2 mb-3">
                      {unmapped.map((r) => (
                        <div key={r.category} className="flex items-center gap-2">
                          <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                            {r.category}
                          </span>
                          <span className="text-xs text-text-muted">→</span>
                          <select
                            value={mapping[r.category] ?? CREATE_NEW}
                            onChange={(e) =>
                              setMapping((prev) => ({ ...prev, [r.category]: e.target.value }))
                            }
                            className="bg-surface-sunken border border-border rounded-md px-2 py-1 text-xs text-text-primary"
                          >
                            <option value={CREATE_NEW}>Create new &ldquo;{r.category}&rdquo;</option>
                            {preview.existingFolders.map((f) => (
                              <option key={f.id} value={f.id}>
                                Map to &ldquo;{f.name}&rdquo;
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {autoMatched.length > 0 && (
                  <details className="text-xs text-text-secondary">
                    <summary className="cursor-pointer text-text-muted hover:text-text-primary">
                      {autoMatched.length} categor{autoMatched.length === 1 ? 'y' : 'ies'}{' '}
                      auto-matched to existing folders (click to review or override)
                    </summary>
                    <div className="mt-2 space-y-1">
                      {autoMatched.map((r) => (
                        <div key={r.category} className="flex items-center gap-2">
                          <span className="text-text-primary flex-1 min-w-0 truncate">
                            {r.category}
                          </span>
                          <span className="text-text-muted">→</span>
                          <select
                            value={mapping[r.category] ?? r.matchedFolderId ?? CREATE_NEW}
                            onChange={(e) =>
                              setMapping((prev) => ({ ...prev, [r.category]: e.target.value }))
                            }
                            className="bg-surface-sunken border border-border rounded-md px-2 py-1 text-text-primary"
                          >
                            {preview.existingFolders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                                {f.id === r.matchedFolderId
                                  ? r.matchKind === 'exact'
                                    ? ' (exact)'
                                    : ' (fuzzy match)'
                                  : ''}
                              </option>
                            ))}
                            <option value={CREATE_NEW}>Create new &ldquo;{r.category}&rdquo;</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 cursor-pointer"
              >
                Start over
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || preview.valid.length === 0}
                className="bg-accent hover:bg-accent-hover text-text-inverse
                  text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Importing…' : `Import ${preview.valid.length} rows`}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 text-xs text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
