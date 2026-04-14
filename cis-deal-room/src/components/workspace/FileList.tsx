'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Sheet, Presentation, Image, Film, File, Download } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

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

interface FileListProps {
  workspaceId: string;
  folderId: string;
  folderName: string;
  isAdmin: boolean;
  onUpload: () => void;
  /** Incremented externally after a successful upload to trigger refetch */
  uploadRevision?: number;
}

function mimeToIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <FileText size={18} className="text-accent" />;
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return <Sheet size={18} className="text-success" />;
  if (mimeType.includes('presentation')) return <Presentation size={18} className="text-warning" />;
  if (mimeType.startsWith('image/')) return <Image size={18} className="text-[#3B82F6]" />;
  if (mimeType.startsWith('video/')) return <Film size={18} className="text-[#8B5CF6]" />;
  return <File size={18} className="text-text-muted" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FileList({ workspaceId, folderId, folderName, isAdmin, onUpload, uploadRevision = 0 }: FileListProps) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [versionsFile, setVersionsFile] = useState<FileRow | null>(null);

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

  async function handleDelete(fileId: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    setDeletingId(fileId);
    try {
      const res = await fetchWithAuth(`/api/files/${fileId}`, { method: 'DELETE' });
      if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading files…
      </div>
    );
  }

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
              text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Upload
          </button>
        </div>
      </div>

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
          <div className="grid grid-cols-[1fr_80px_130px_120px_60px] gap-2 py-2 text-xs font-semibold
            uppercase tracking-wider text-text-muted border-b border-border">
            <span>File</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>By</span>
            <span />
          </div>

          {/* File rows */}
          {filtered.map((file) => (
            <div
              key={file.id}
              className="grid grid-cols-[1fr_80px_130px_120px_60px] gap-2 py-3 items-center
                border-b border-border-subtle hover:bg-surface-elevated transition-colors group"
            >
              {/* Name + icon */}
              <div className="flex items-center gap-2.5 min-w-0">
                {mimeToIcon(file.mimeType)}
                <span className="text-sm text-text-primary truncate font-medium">{file.name}</span>
                {file.version > 1 && (
                  <button
                    onClick={() => setVersionsFile(file)}
                    className="shrink-0 text-[10px] font-mono bg-surface-sunken text-text-muted px-1.5 py-0.5 rounded hover:bg-border-subtle"
                  >
                    v{file.version}
                  </button>
                )}
              </div>

              {/* Size */}
              <span className="text-xs text-text-muted font-mono">{formatBytes(file.sizeBytes)}</span>

              {/* Date */}
              <span className="text-xs text-text-secondary">{formatDate(file.createdAt)}</span>

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
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(file)}
                  title="Download"
                  className="p-1 text-text-muted hover:text-text-primary transition-colors"
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
          ))}
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
    </div>
  );
}
