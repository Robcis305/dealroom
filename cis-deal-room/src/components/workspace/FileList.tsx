'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Sheet, Presentation, Image, Film, File,
  Download, Eye, Trash2, FolderInput, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { useSoftDelete } from '@/lib/use-soft-delete';
import { formatDate } from '@/lib/format-date';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';
import { MoveToFolderModal } from './MoveToFolderModal';
import { isPreviewable } from '@/lib/preview';
import { PreviewModal, type PreviewFile } from './PreviewModal';

interface FileRow {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  uploadedByEmail?: string;
  uploadedByFirstName?: string | null;
  uploadedByLastName?: string | null;
  createdAt: string | Date;
}

interface FolderRef {
  id: string;
  name: string;
}

interface FileListProps {
  workspaceId: string;
  folderId: string;
  folderName: string;
  isAdmin: boolean;
  onUpload: () => void;
  /** Incremented externally after a successful upload to trigger refetch */
  uploadRevision?: number;
  /** All folders in the workspace — used by the Move-to-folder action */
  folders: FolderRef[];
}

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

export function FileList({ workspaceId, folderId, folderName, isAdmin, onUpload, uploadRevision = 0, folders }: FileListProps) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [versionsFile, setVersionsFile] = useState<FileRow | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [canPreview, setCanPreview] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const softDelete = useSoftDelete();

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
      const res = await fetchWithAuth(`/api/files?folderId=${folderId}`);
      if (res.ok) setFiles(await res.json());
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { load(); }, [load, uploadRevision]);

  // Clear selection whenever the folder changes
  useEffect(() => { setSelectedIds(new Set()); }, [folderId]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  async function handleDownload(file: FileRow) {
    const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      toast.info(`Stub mode — real download requires AWS_S3_BUCKET set`, {
        description: file.name,
      });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }

  /**
   * Batch delete with a 10-second undo window.
   * Files are removed from the local list immediately; the server DELETE
   * fires after the undo window elapses.
   */
  function performDeleteIds(ids: string[]) {
    const toDelete = files.filter((f) => ids.includes(f.id));
    if (toDelete.length === 0) return;

    // Optimistic removal
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    clearSelection();

    const batchId = `files-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const label = toDelete.length === 1
      ? toDelete[0].name
      : `${toDelete.length} files`;

    softDelete({
      id: batchId,
      label,
      onRestore: () => {
        setFiles((prev) => {
          const existingIds = new Set(prev.map((f) => f.id));
          const restored = toDelete.filter((f) => !existingIds.has(f.id));
          return [...restored, ...prev].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      },
      performDelete: async () => {
        const results = await Promise.all(
          toDelete.map((f) =>
            fetchWithAuth(`/api/files/${f.id}`, { method: 'DELETE' }).then((r) => r.ok)
          )
        );
        return results.every(Boolean);
      },
    });
  }

  async function handleBulkDownload(ids: string[]) {
    if (ids.length === 0) return;
    setDownloadingZip(true);
    try {
      const res = await fetchWithAuth('/api/files/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids }),
      });
      if (res.status === 501) {
        toast.info('Bulk download coming soon', {
          description: 'The zip endpoint isn\'t wired yet.',
        });
        return;
      }
      if (!res.ok) {
        toast.error('Failed to prepare download');
        return;
      }
      const { url } = await res.json();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.click();
      }
    } finally {
      setDownloadingZip(false);
    }
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = selectedIds.size;
  const allVisibleSelected = useMemo(
    () => filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id)),
    [filtered, selectedIds]
  );
  const someVisibleSelected = !allVisibleSelected && filtered.some((f) => selectedIds.has(f.id));

  function toggleAllVisible() {
    if (allVisibleSelected) {
      clearSelection();
    } else {
      setSelectedIds(new Set(filtered.map((f) => f.id)));
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading files…
      </div>
    );
  }

  const GRID = 'grid grid-cols-[32px_1fr_80px_130px_120px_80px] gap-2';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 shrink-0">
        <h2 className="text-lg font-semibold text-text-primary tracking-tight">{folderName}</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm
              text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-text-inverse
              text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Upload
          </button>
        </div>
      </div>

      {/* Selection action bar — visible when any file is selected */}
      {selectedCount > 0 && (
        <div className="mx-8 mb-3 flex items-center gap-3 bg-surface-elevated border border-border
          rounded-lg px-4 py-2 shrink-0">
          <span className="text-sm font-medium text-text-primary">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              disabled={folders.length <= 1}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary
                hover:bg-surface px-2.5 py-1.5 rounded-md transition-colors cursor-pointer
                disabled:opacity-40 disabled:cursor-not-allowed
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title={folders.length <= 1 ? 'Create another folder to move files' : 'Move to folder'}
            >
              <FolderInput size={14} aria-hidden="true" />
              Move
            </button>
            <button
              type="button"
              onClick={() => handleBulkDownload(Array.from(selectedIds))}
              disabled={downloadingZip}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary
                hover:bg-surface px-2.5 py-1.5 rounded-md transition-colors cursor-pointer
                disabled:opacity-60 disabled:cursor-wait
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Download size={14} aria-hidden="true" />
              Download
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmDeleteIds(Array.from(selectedIds))}
                className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent-on-subtle
                  hover:bg-accent-subtle px-2.5 py-1.5 rounded-md transition-colors cursor-pointer
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection"
              className="p-1.5 text-text-muted hover:text-text-primary rounded-md transition-colors
                cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Clear selection"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* File table */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
          <File size={32} />
          <p className="text-sm">
            {files.length === 0 ? 'No files yet — upload the first one' : 'No files match your search'}
          </p>
          {files.length === 0 && (
            <button
              onClick={onUpload}
              className="text-accent text-sm font-medium hover:underline"
            >
              Upload files
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8">
          {/* Table header */}
          <div className={`${GRID} py-2 text-xs font-semibold
            uppercase tracking-wider text-text-muted border-b border-border items-center`}>
            <span className="flex items-center justify-center">
              <input
                type="checkbox"
                aria-label={allVisibleSelected ? 'Deselect all files' : 'Select all files'}
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someVisibleSelected;
                }}
                onChange={toggleAllVisible}
                className="w-4 h-4 rounded cursor-pointer accent-accent"
              />
            </span>
            <span>File</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>By</span>
            <span />
          </div>

          {/* File rows */}
          {filtered.map((file) => {
            const isSelected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                className={`${GRID} py-3 items-center border-b border-border-subtle
                  transition-colors group ${
                    isSelected ? 'bg-accent-subtle/50' : 'hover:bg-surface-elevated'
                  }`}
              >
                {/* Row checkbox */}
                <span className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`${isSelected ? 'Deselect' : 'Select'} ${file.name}`}
                    checked={isSelected}
                    onChange={() => toggleSelect(file.id)}
                    className="w-4 h-4 rounded cursor-pointer accent-accent"
                  />
                </span>

                {/* Name + icon */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {mimeToIcon(file.mimeType)}
                  <span className="text-sm text-text-primary truncate font-medium">{file.name}</span>
                  {file.version > 1 && (
                    <button
                      onClick={() => setVersionsFile(file)}
                      className="shrink-0 text-[11px] font-semibold bg-accent-subtle text-accent-on-subtle
                        border border-accent/30 px-2 py-0.5 rounded-md font-mono
                        hover:bg-accent hover:text-text-inverse transition-colors cursor-pointer"
                    >
                      v{file.version}
                    </button>
                  )}
                </div>

                {/* Size */}
                <span className="text-xs text-text-muted font-mono">{formatBytes(file.sizeBytes)}</span>

                {/* Date */}
                <span className="text-xs text-text-secondary font-mono">{formatDate(file.createdAt)}</span>

                {/* Uploader */}
                <span className="text-xs text-text-secondary truncate">
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
                      className="w-8 h-8 rounded flex items-center justify-center
                        text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Preview"
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(file)}
                    aria-label={`Download ${file.name}`}
                    title="Download"
                    className="w-8 h-8 rounded flex items-center justify-center
                      text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Download size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {versionsFile && (
        <VersionHistoryDrawer
          workspaceId={workspaceId}
          fileId={versionsFile.id}
          fileName={versionsFile.name}
          isAdmin={isAdmin}
          open={!!versionsFile}
          onClose={() => setVersionsFile(null)}
          onVersionDeleted={load}
        />
      )}
      {previewFile && (
        <PreviewModal
          file={previewFile}
          open={true}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteIds && confirmDeleteIds.length > 0}
        onClose={() => setConfirmDeleteIds(null)}
        onConfirm={() => {
          if (confirmDeleteIds) performDeleteIds(confirmDeleteIds);
          setConfirmDeleteIds(null);
        }}
        title={
          confirmDeleteIds?.length === 1
            ? `Delete ${files.find((f) => f.id === confirmDeleteIds[0])?.name ?? 'this file'}?`
            : `Delete ${confirmDeleteIds?.length ?? 0} files?`
        }
        description="You'll have 10 seconds to undo after confirming."
        preserves={[
          'Previous versions remain in version history',
          'Activity log entries about these files',
        ]}
        confirmLabel={confirmDeleteIds?.length === 1 ? 'Delete file' : `Delete ${confirmDeleteIds?.length ?? 0} files`}
        tone="destructive"
      />

      <MoveToFolderModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        fileIds={Array.from(selectedIds)}
        currentFolderId={folderId}
        folders={folders}
        onMoved={() => {
          clearSelection();
          load();
        }}
      />
    </div>
  );
}
