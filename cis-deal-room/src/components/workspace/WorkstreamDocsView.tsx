'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Sheet, Presentation, Image, Film, File,
  Download, Eye, ChevronLeft, Folder,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { formatDate } from '@/lib/format-date';
import { isPreviewable } from '@/lib/preview';
import { PreviewModal, type PreviewFile } from './PreviewModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileRow {
  id: string;
  folderId: string;
  folderName: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  createdAt: string | Date;
  uploadedByEmail?: string;
  uploadedByFirstName?: string | null;
  uploadedByLastName?: string | null;
}

interface Props {
  workspaceId: string;
  workstreamId: string;
  workstreamName: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeToIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <FileText size={18} className="text-text-primary" />;
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return <Sheet size={18} className="text-success" />;
  if (mimeType.includes('presentation')) return <Presentation size={18} className="text-warning" />;
  if (mimeType.startsWith('image/')) return <Image size={18} className="text-text-muted" />;
  if (mimeType.startsWith('video/')) return <Film size={18} className="text-text-muted" />;
  return <File size={18} className="text-text-muted" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── WorkstreamDocsView ─────────────────────────────────────────────────────────

export function WorkstreamDocsView({ workspaceId, workstreamId, workstreamName, onBack }: Props) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [canPreview, setCanPreview] = useState(false);

  useEffect(() => {
    function check() {
      setCanPreview(typeof window !== 'undefined' && window.innerWidth >= 1024);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams/${workstreamId}/files`);
      if (res.ok) {
        const { files: rows } = await res.json();
        setFiles(rows);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workstreamId]);

  useEffect(() => { load(); }, [load]);

  async function handleDownload(file: FileRow) {
    const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      toast.info('Stub mode — real download requires AWS_S3_BUCKET set', { description: file.name });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }

  // Group files by folder for display.
  const groups = useMemo(() => {
    const map = new Map<string, FileRow[]>();
    for (const f of files) {
      if (!map.has(f.folderName)) map.set(f.folderName, []);
      map.get(f.folderName)!.push(f);
    }
    return Array.from(map.entries());
  }, [files]);

  return (
    <div className="p-6">
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-border px-4" style={{ height: 58 }}>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
            aria-label="Back to workstream"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="flex-1 truncate text-sm font-medium text-text-primary">
            {workstreamName} documents
          </span>
          {!loading && (
            <span className="text-xs text-text-muted font-mono">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        {loading ? (
          <p className="p-8 text-sm text-text-muted">Loading…</p>
        ) : files.length === 0 ? (
          <p className="p-8 text-sm text-text-muted">
            No documents are tagged to {workstreamName} yet. Tag files with this workstream from any folder to see them here.
          </p>
        ) : (
          <div className="flex flex-col">
            {groups.map(([folderName, rows]) => (
              <div key={folderName}>
                {/* Folder header */}
                <div className="flex items-center gap-2 px-4 py-2 bg-surface-elevated border-b border-border text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <Folder size={13} /> {folderName}
                </div>
                {rows.map((file) => (
                  <div
                    key={file.id}
                    className="grid items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-elevated transition-colors"
                    style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
                  >
                    {/* Name + icon */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {mimeToIcon(file.mimeType)}
                      <span className="text-sm text-text-primary truncate font-medium">{file.name}</span>
                      {file.version > 1 && (
                        <span className="shrink-0 text-[11px] font-semibold bg-accent-subtle text-accent-on-subtle border border-accent/30 px-2 py-0.5 rounded-md font-mono">
                          v{file.version}
                        </span>
                      )}
                    </div>

                    {/* Size */}
                    <span className="text-xs text-text-muted font-mono">{formatBytes(file.sizeBytes)}</span>

                    {/* Date */}
                    <span className="text-xs text-text-secondary font-mono">{formatDate(file.createdAt)}</span>

                    {/* Uploader */}
                    <span className="text-xs text-text-secondary truncate max-w-[140px]">
                      {file.uploadedByEmail
                        ? displayName({
                            firstName: file.uploadedByFirstName ?? null,
                            lastName: file.uploadedByLastName ?? null,
                            email: file.uploadedByEmail,
                          })
                        : '—'}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 justify-end">
                      {canPreview && isPreviewable(file.mimeType) && (
                        <button
                          type="button"
                          aria-label={`Preview ${file.name}`}
                          onClick={() => setPreviewFile(file as PreviewFile)}
                          className="w-8 h-8 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Preview"
                        >
                          <Eye size={16} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        aria-label={`Download ${file.name}`}
                        title="Download"
                        className="w-8 h-8 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Download size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {previewFile && (
        <PreviewModal file={previewFile} open={true} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
