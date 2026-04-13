'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Sheet, Presentation, Image, Film, File, Download } from 'lucide-react';

interface FileRow {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  uploadedByEmail?: string;
  createdAt: string | Date;
}

interface FileListProps {
  folderId: string;
  folderName: string;
  isAdmin: boolean;
  onUpload: () => void;
  /** Incremented externally after a successful upload to trigger refetch */
  uploadRevision?: number;
}

function mimeToIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <FileText size={18} className="text-[#E10600]" />;
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return <Sheet size={18} className="text-green-400" />;
  if (mimeType.includes('presentation')) return <Presentation size={18} className="text-orange-400" />;
  if (mimeType.startsWith('image/')) return <Image size={18} className="text-blue-400" />;
  if (mimeType.startsWith('video/')) return <Film size={18} className="text-purple-400" />;
  return <File size={18} className="text-neutral-400" />;
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

export function FileList({ folderId, folderName, isAdmin, onUpload, uploadRevision = 0 }: FileListProps) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?folderId=${folderId}`);
      if (res.ok) setFiles(await res.json());
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { load(); }, [load, uploadRevision]);

  async function handleDownload(file: FileRow) {
    const res = await fetch(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      alert(`[Stub] Would download: ${file.name}`);
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
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
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
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Loading files…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 shrink-0">
        <h2 className="text-lg font-semibold text-white tracking-tight">{folderName}</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm
              text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#E10600]"
          />
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 bg-[#E10600] hover:bg-[#C10500] text-white
              text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Upload
          </button>
        </div>
      </div>

      {/* File table */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500">
          <File size={32} />
          <p className="text-sm">
            {files.length === 0 ? 'No files yet — upload the first one' : 'No files match your search'}
          </p>
          {files.length === 0 && (
            <button
              onClick={onUpload}
              className="text-[#E10600] text-sm font-medium hover:underline"
            >
              Upload files
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_130px_120px_60px] gap-2 py-2 text-xs font-semibold
            uppercase tracking-wider text-neutral-500 border-b border-[#2A2A2A]">
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
                border-b border-[#1A1A1A] hover:bg-[#161616] transition-colors group"
            >
              {/* Name + icon */}
              <div className="flex items-center gap-2.5 min-w-0">
                {mimeToIcon(file.mimeType)}
                <span className="text-sm text-white truncate font-medium">{file.name}</span>
                {file.version > 1 && (
                  <span className="shrink-0 text-[10px] font-mono bg-[#2A2A2A] text-neutral-400
                    px-1.5 py-0.5 rounded">
                    v{file.version}
                  </span>
                )}
              </div>

              {/* Size */}
              <span className="text-xs text-neutral-500 font-mono">{formatBytes(file.sizeBytes)}</span>

              {/* Date */}
              <span className="text-xs text-neutral-400">{formatDate(file.createdAt)}</span>

              {/* Uploader */}
              <span className="text-xs text-neutral-400 truncate">{file.uploadedByEmail ?? '—'}</span>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(file)}
                  title="Download"
                  className="p-1 text-neutral-500 hover:text-white transition-colors"
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
