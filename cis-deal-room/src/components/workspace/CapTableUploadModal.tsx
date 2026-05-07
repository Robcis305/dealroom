'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface ParseErrorDisplay {
  code: string;
  row?: number;
  column?: string;
  message: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workspaceId: string;
}

export function CapTableUploadModal({ open, onClose, onSuccess, workspaceId }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ParseErrorDisplay[]>([]);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setSubmitting(true);
    setErrors([]);
    setGenericError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/cap-table/upload`, {
        method: 'POST',
        body: fd,
      });
      if (res.status === 400) {
        const body = await res.json();
        if (Array.isArray(body.errors)) {
          setErrors(body.errors);
        } else {
          setGenericError(body.error ?? 'Upload failed');
        }
        return;
      }
      if (!res.ok) {
        setGenericError(`Upload failed (${res.status})`);
        return;
      }
      onSuccess();
      onClose();
    } catch (e) {
      setGenericError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const hasErrors = errors.length > 0 || genericError;

  return (
    <Modal open={open} onClose={onClose} title="Upload Cap Table">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          CSV with required columns: Holder, Class, Instrument, Shares, Ownership&nbsp;%,
          Price per Share, Amount Invested. Optional: Round, Round Valuation, Vesting Start,
          Vesting Schedule, Certificate / Grant&nbsp;#, Notes.
        </p>

        {/* Drop zone */}
        {!submitting && !hasErrors && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-10 text-center transition-colors duration-150 cursor-pointer ${
              dragging
                ? 'border-accent/60 bg-accent/5'
                : 'border-border hover:border-border/80 bg-surface-sunken/30 hover:bg-surface-sunken/50'
            }`}
          >
            <Upload className="w-8 h-8 text-text-muted" />
            <div>
              <p className="text-sm text-text-secondary">
                Drop a CSV here or{' '}
                <span className="text-text-primary cursor-pointer hover:underline">browse</span>
              </p>
              <p className="font-mono text-xs text-text-muted mt-1">.csv · max 5 MB</p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={submitting}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // reset so same file can be re-selected
            e.target.value = '';
          }}
        />

        {submitting && (
          <div className="flex items-center gap-2 text-sm text-text-secondary py-4 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Parsing…
          </div>
        )}

        {genericError && (
          <div className="border border-accent/30 bg-accent/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-accent mb-1">
              <AlertCircle size={14} />
              Upload failed
            </div>
            <p className="font-mono text-xs text-text-secondary">{genericError}</p>
            <button
              onClick={() => { setGenericError(null); inputRef.current?.click(); }}
              className="mt-3 text-xs text-text-secondary hover:text-text-primary underline"
            >
              Try again
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="border border-accent/30 bg-accent/5 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 text-sm font-medium text-accent mb-3">
              <AlertCircle size={14} />
              {errors.length} parse error{errors.length === 1 ? '' : 's'} — fix and re-upload
            </div>
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {errors.map((e, i) => (
                <li key={i} className="font-mono text-xs text-text-secondary">
                  {e.row ? <span className="text-accent/70">Row {e.row}:</span> : null}
                  {e.row ? ' ' : ''}{e.message}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { setErrors([]); inputRef.current?.click(); }}
              className="mt-3 text-xs text-text-secondary hover:text-text-primary underline"
            >
              Choose a different file
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
