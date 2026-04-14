'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Folder {
  id: string;
  name: string;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  initialFolderId?: string;
  workspaceId: string;
  onUploadComplete: () => void;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/csv': ['.csv'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'video/mp4': ['.mp4'],
};

const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

type FileStatus = 'pending' | 'duplicate' | 'uploading' | 'done' | 'error';

interface QueuedFile {
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  duplicateVersion?: number;
  confirmedVersioning?: boolean;
}

/**
 * Normalizes an API error payload to a display string.
 * Server error responses may be `{ error: "msg" }` or `{ error: [...zodIssues] }`;
 * rendering the raw array in JSX throws "Objects are not valid as a React child".
 */
function toErrorString(err: unknown, fallback = 'Upload failed'): string {
  if (typeof err === 'string') return err;
  if (Array.isArray(err) && err.length > 0) {
    const first = err[0] as { message?: unknown };
    if (typeof first?.message === 'string') return first.message;
  }
  return fallback;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadModal({
  open,
  onClose,
  folders,
  initialFolderId,
  workspaceId,
  onUploadComplete,
}: UploadModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId ?? folders[0]?.id ?? '');
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  // UX fix #2b: clear queue when modal closes via any path (Done, Cancel, or
  // automatic close-after-upload via onUploadComplete).
  useEffect(() => {
    if (!open) {
      setQueue([]);
      setUploading(false);
    }
  }, [open]);

  // Sync selectedFolderId to the current initialFolderId whenever the modal
  // opens. useState() only honors the initial value once at first mount, so
  // without this sync the modal remembers the folder from its first open.
  useEffect(() => {
    if (open) {
      setSelectedFolderId(initialFolderId ?? folders[0]?.id ?? '');
    }
  }, [open, initialFolderId, folders]);

  const onDrop = useCallback((accepted: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, status: 'pending' as FileStatus, progress: 0 })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  function updateFile(index: number, patch: Partial<QueuedFile>) {
    setQueue((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFile(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadOne(qf: QueuedFile, index: number, folderId: string): Promise<string | null> {
    const { file, confirmedVersioning } = qf;

    // 1. Request presigned URL
    const presignRes = await fetchWithAuth('/api/files/presign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        workspaceId,
      }),
    });

    const presignData = await presignRes.json();

    if (!presignRes.ok) {
      updateFile(index, { status: 'error', error: toErrorString(presignData.error) });
      return null;
    }

    // 2. Duplicate detected and not yet confirmed
    if (presignData.duplicate && !confirmedVersioning) {
      updateFile(index, { status: 'duplicate', duplicateVersion: presignData.existingVersion });
      return null;
    }

    const { presignedUrl, s3Key } = presignData;

    // 3. Upload to S3 (or skip for stub)
    if (presignedUrl) {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateFile(index, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 PUT failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    }

    // 4. Confirm with the API
    const confirmRes = await fetchWithAuth('/api/files/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        fileName: file.name,
        s3Key,
        sizeBytes: file.size,
        mimeType: file.type,
        workspaceId,
        confirmedVersioning: confirmedVersioning ?? false,
      }),
    });

    if (!confirmRes.ok) {
      const body = await confirmRes.json();
      updateFile(index, { status: 'error', error: toErrorString(body.error) });
      return null;
    }

    const confirmed = (await confirmRes.json()) as { id: string };
    updateFile(index, { status: 'done', progress: 100 });
    return confirmed.id;
  }

  async function handleUpload() {
    if (!selectedFolderId || queue.length === 0) return;
    setUploading(true);

    const succeededIds: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const qf = queue[i];
      if (qf.status === 'done' || qf.status === 'error') continue;
      updateFile(i, { status: 'uploading', progress: 0 });
      const fileId = await uploadOne(qf, i, selectedFolderId);
      if (fileId) succeededIds.push(fileId);
    }

    // Fire the batch-notify call once, after all uploads resolve. Failures
    // here don't fail the upload flow (notification is best-effort).
    if (succeededIds.length > 0) {
      try {
        await fetchWithAuth(`/api/workspaces/${workspaceId}/notify-upload-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: selectedFolderId, fileIds: succeededIds }),
        });
      } catch (err) {
        console.warn('[UploadModal] notify-batch failed:', err);
      }
    }

    setUploading(false);
    if (succeededIds.length > 0) onUploadComplete();
  }

  function handleClose() {
    if (uploading) return;
    setQueue([]);
    onClose();
  }

  const allDone = queue.length > 0 && queue.every((f) => f.status === 'done');

  return (
    <Modal open={open} onClose={handleClose} title="Upload Documents">
      <div className="space-y-4">
        {/* Folder selector — UX fix #2a: show read-only label when folder is
            pre-selected (opened from within a folder), full select otherwise */}
        {initialFolderId ? (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Uploading to
            </label>
            <div className="px-3 py-2 bg-surface-sunken border border-border rounded-md text-sm text-text-primary">
              {folders.find((f) => f.id === initialFolderId)?.name ?? 'Folder'}
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="upload-folder" className="block text-sm font-medium text-text-secondary mb-1.5">
              Upload to folder
            </label>
            <select
              id="upload-folder"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              disabled={uploading}
              className="w-full bg-surface-sunken border border-border rounded-md px-3 py-2 text-sm
                text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-accent bg-accent-subtle'
              : 'border-border hover:border-border bg-bg'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={28} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm font-medium text-text-secondary">
            {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            PDF, DOCX, XLSX, PPTX, CSV, JPG, PNG, MP4 — max 500 MB each
          </p>
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {queue.map((qf, i) => (
              <div key={i} className="flex items-center gap-3 bg-surface rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary truncate font-medium">{qf.file.name}</span>
                    <span className="text-xs text-text-muted shrink-0">{formatBytes(qf.file.size)}</span>
                  </div>

                  {qf.status === 'uploading' && (
                    <div className="mt-1.5 h-1 bg-border-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-150"
                        style={{ width: `${qf.progress}%` }}
                      />
                    </div>
                  )}

                  {qf.status === 'duplicate' && (
                    <p className="text-xs text-warning mt-1">
                      File exists (v{qf.duplicateVersion}) —{' '}
                      <button
                        onClick={() => updateFile(i, { status: 'pending', confirmedVersioning: true })}
                        className="underline hover:no-underline"
                      >
                        Upload as v{(qf.duplicateVersion ?? 0) + 1}
                      </button>
                      {' '}or{' '}
                      <button onClick={() => removeFile(i)} className="underline hover:no-underline">
                        cancel
                      </button>
                    </p>
                  )}

                  {qf.status === 'error' && (
                    <p className="text-xs text-danger mt-1">{qf.error}</p>
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0">
                  {qf.status === 'done' && <CheckCircle size={16} className="text-success" />}
                  {qf.status === 'uploading' && <Loader2 size={16} className="text-accent animate-spin" />}
                  {qf.status === 'error' && <AlertCircle size={16} className="text-danger" />}
                  {(qf.status === 'pending' || qf.status === 'duplicate') && !uploading && (
                    <button onClick={() => removeFile(i)} className="text-text-muted hover:text-text-primary">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-sunken text-text-secondary
              hover:bg-border-subtle transition-colors disabled:opacity-50"
          >
            {allDone ? 'Done' : 'Cancel'}
          </button>
          {!allDone && (
            <button
              onClick={handleUpload}
              disabled={uploading || queue.length === 0 || queue.every((f) => f.status === 'done')}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-accent text-text-inverse
                hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading && <Loader2 size={14} className="animate-spin" />}
              {uploading ? 'Uploading…' : `Upload ${queue.filter((f) => f.status === 'pending').length || ''} file${queue.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
