'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistPriority, ChecklistOwner } from '@/types';

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

interface PreviewPayload {
  valid: ParsedRow[];
  rejected: Array<{ rowNumber: number; reason: string }>;
}

export function ChecklistImportModal({ workspaceId, onClose, onImported }: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
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
    setPreview(await res.json());
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  });

  async function handleConfirm() {
    if (!preview) return;
    setSubmitting(true);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: preview.valid.map((r) => ({
            ...r,
            // zod schema on server expects ISO datetime string or null — ParsedRow.requestedAt is already string|null from API
            requestedAt: r.requestedAt,
          })),
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
      <div className="bg-surface border border-border rounded-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
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
