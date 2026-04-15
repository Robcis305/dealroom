'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getPreviewKind } from '@/lib/preview';
import { displayName } from '@/lib/users/display';
import { PdfPreview } from './preview/PdfPreview';
import { ImagePreview } from './preview/ImagePreview';
import { VideoPreview } from './preview/VideoPreview';
import { SheetPreview } from './preview/SheetPreview';

export interface PreviewFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedByEmail?: string;
  uploadedByFirstName?: string | null;
  uploadedByLastName?: string | null;
  createdAt: string | Date;
}

interface PreviewModalProps {
  file: PreviewFile;
  open: boolean;
  onClose: () => void;
}

type PresignState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; kind: 'forbidden' | 'notfound' | 'network' | 'renderer' };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewModal({ file, open, onClose }: PreviewModalProps) {
  const [state, setState] = useState<PresignState>({ status: 'loading' });
  const kind = getPreviewKind(file.mimeType);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
        if (aborted) return;
        if (res.status === 403) return setState({ status: 'error', kind: 'forbidden' });
        if (res.status === 404) return setState({ status: 'error', kind: 'notfound' });
        if (!res.ok) return setState({ status: 'error', kind: 'network' });
        const { url } = (await res.json()) as { url: string };
        setState({ status: 'ready', url });
        fetchWithAuth(`/api/files/${file.id}/log-preview`, { method: 'POST' }).catch(() => {
          /* silent */
        });
      } catch {
        if (!aborted) setState({ status: 'error', kind: 'network' });
      }
    })();

    return () => {
      aborted = true;
    };
  }, [open, file.id]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleDownload = useCallback(async () => {
    const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    if (url.startsWith('stub://')) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }, [file.id, file.name]);

  if (!open) return null;

  const uploader = displayName({
    email: file.uploadedByEmail ?? '',
    firstName: file.uploadedByFirstName ?? null,
    lastName: file.uploadedByLastName ?? null,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#1A1A1A] border-b border-white/10 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">{file.name}</span>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded font-semibold">v{file.version}</span>
          <span className="text-xs text-white/60">
            · {formatBytes(file.sizeBytes)} · {uploader}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Download"
            onClick={handleDownload}
            className="w-8 h-8 rounded border border-white/20 flex items-center justify-center hover:bg-white/10"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="w-8 h-8 rounded border border-white/20 flex items-center justify-center hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        {state.status === 'loading' && (
          <div className="text-white/60 text-sm">Loading preview…</div>
        )}
        {state.status === 'error' && state.kind === 'forbidden' && (
          <div className="text-white/80 text-sm">You no longer have access to this file.</div>
        )}
        {state.status === 'error' && state.kind === 'notfound' && (
          <div className="text-white/80 text-sm">This file no longer exists.</div>
        )}
        {state.status === 'error' && (state.kind === 'network' || state.kind === 'renderer') && (
          <div className="flex flex-col items-center gap-3 text-white/80 text-sm">
            <div>Couldn&apos;t load preview — download instead.</div>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20"
            >
              Download
            </button>
          </div>
        )}
        {state.status === 'ready' && kind === 'pdf' && <PdfPreview url={state.url} />}
        {state.status === 'ready' && kind === 'image' && <ImagePreview url={state.url} alt={file.name} />}
        {state.status === 'ready' && kind === 'video' && <VideoPreview url={state.url} />}
        {state.status === 'ready' && kind === 'sheet' && (
          <SheetPreview url={state.url} mimeType={file.mimeType} sizeBytes={file.sizeBytes} />
        )}
      </div>
    </div>
  );
}
