'use client';

import { useEffect, useState } from 'react';
import { X, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { formatDate } from '@/lib/format-date';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSoftDelete } from '@/lib/use-soft-delete';

interface Version {
  id: string;
  version: number;
  sizeBytes: number;
  mimeType: string;
  s3Key: string;
  createdAt: string;
  uploadedByEmail: string;
  uploadedByFirstName: string | null;
  uploadedByLastName: string | null;
}

interface VersionHistoryDrawerProps {
  workspaceId: string;
  fileId: string;
  fileName: string;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  onVersionDeleted: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionHistoryDrawer({
  workspaceId, fileId, fileName, isAdmin, open, onClose, onVersionDeleted,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Version | null>(null);
  const softDelete = useSoftDelete();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchWithAuth(`/api/workspaces/${workspaceId}/files/${fileId}/versions`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [open, workspaceId, fileId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleDownload(version: Version) {
    const res = await fetchWithAuth(`/api/files/${version.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      toast.info(`Stub mode — real download requires AWS_S3_BUCKET set`, { description: fileName });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, '')}-v${version.version}.${fileName.split('.').pop()}`;
    a.click();
  }

  function performDelete(version: Version) {
    // Optimistic local remove; soft-delete handles server call after 10s undo window
    setVersions((prev) => prev.filter((v) => v.id !== version.id));
    softDelete({
      id: version.id,
      label: `v${version.version}`,
      onRestore: () => {
        // Re-insert in original position by version number descending
        setVersions((prev) => [...prev, version].sort((a, b) => b.version - a.version));
      },
      performDelete: async () => {
        const res = await fetchWithAuth(`/api/files/${version.id}`, { method: 'DELETE' });
        if (res.ok) {
          onVersionDeleted();
          return true;
        }
        return false;
      },
    });
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-surface-sunken/70 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-96 z-50 bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Version history</h2>
            <p className="text-xs text-text-muted truncate">{fileName}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-xs text-text-muted">Loading...</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-text-muted">No versions.</p>
          ) : (
            versions.map((v) => {
              const uploader = displayName({
                firstName: v.uploadedByFirstName,
                lastName: v.uploadedByLastName,
                email: v.uploadedByEmail,
              });
              return (
                <div key={v.id} className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary">v{v.version}</span>
                    <span className="text-xs text-text-muted font-mono">{formatBytes(v.sizeBytes)}</span>
                  </div>
                  <p className="text-xs text-text-secondary">{uploader}</p>
                  <p className="text-xs text-text-muted mb-2">{formatDate(v.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(v)}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Download size={14} aria-hidden="true" /> Download
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDelete(v)}
                        className="flex items-center gap-1 text-xs text-danger hover:underline ml-auto"
                      >
                        <Trash2 size={14} aria-hidden="true" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          performDelete(confirmDelete);
          setConfirmDelete(null);
        }}
        title={confirmDelete ? `Delete v${confirmDelete.version} of ${fileName}?` : ''}
        description="You'll have 10 seconds to undo after confirming."
        preserves={['Earlier versions remain accessible', 'Activity log entries about this version']}
        confirmLabel="Delete version"
        tone="destructive"
      />
    </>
  );
}
