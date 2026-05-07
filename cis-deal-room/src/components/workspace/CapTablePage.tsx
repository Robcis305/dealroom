'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Upload, Eye, EyeOff, Download, ChevronDown, Table2, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { CapTableUploadModal } from './CapTableUploadModal';
import { CapTableRoundsSummary } from './CapTableRoundsSummary';
import { CapTableRowsView } from './CapTableRowsView';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { CapTableStatus, CapTableInstrument } from '@/types';

interface CapTableMeta {
  id: string;
  status: CapTableStatus;
  uploadedAt: string;
  publishedAt: string | null;
  parseWarnings: Array<{ code: string; row?: number; message: string }>;
}

interface Row {
  id: string;
  rowNumber: number;
  holder: string;
  className: string;
  instrument: CapTableInstrument;
  shares: number;
  ownershipPercent: string;
  pricePerShare: string;
  amountInvested: string;
  round: string | null;
  roundValuation: string | null;
  vestingStart: string | null;
  vestingSchedule: string | null;
  certificateNumber: string | null;
  notes: string | null;
}

interface Props {
  workspaceId: string;
  isAdmin: boolean;
}

export function CapTablePage({ workspaceId, isAdmin }: Props) {
  const [loading, setLoading] = useState(true);
  const [capTable, setCapTable] = useState<CapTableMeta | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hidden, setHidden] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/cap-table`);
    if (res.ok) {
      const data = await res.json();
      setCapTable(data.capTable ?? null);
      setRows(data.rows ?? []);
      setHidden(!!data.hidden);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function togglePublish() {
    if (!capTable || publishing) return;
    setPublishing(true);
    const target = capTable.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetchWithAuth(
        `/api/workspaces/${workspaceId}/cap-table/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        },
      );
      if (res.ok) await refresh();
    } finally {
      setPublishing(false);
    }
  }

  async function downloadCsv() {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/cap-table/download`);
    if (res.ok) {
      const data = await res.json();
      window.location.href = data.url;
    }
  }

  async function clearCapTable() {
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/cap-table`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      refresh();
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 text-sm text-text-muted">Loading…</div>;
  }

  // ── Buyer viewing draft (hidden) ─────────────────────────────────────────
  if (hidden) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Link
          href={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to workspace
        </Link>
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <Table2 className="w-10 h-10 text-text-muted/40 mb-4" />
        <h1 className="text-base font-medium text-text-secondary mb-2">Cap table not yet shared</h1>
        <p className="text-sm text-text-muted max-w-xs">
          The seller hasn&apos;t published the cap table yet. Check back when it&apos;s available.
        </p>
        </div>
      </div>
    );
  }

  // ── No cap table at all ───────────────────────────────────────────────────
  if (!capTable) {
    if (!isAdmin) {
      return (
        <div className="p-8 max-w-7xl mx-auto">
          <Link
            href={`/workspace/${workspaceId}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft size={14} />
            Back to workspace
          </Link>
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <Table2 className="w-10 h-10 text-text-muted/40 mb-4" />
            <h1 className="text-base font-medium text-text-secondary mb-2">No cap table uploaded</h1>
            <p className="text-sm text-text-muted max-w-xs">No cap table has been uploaded to this workspace yet.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Link
          href={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to workspace
        </Link>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">Cap Table</h1>
          </div>
        </div>

        {/* Empty state / upload prompt */}
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center border border-dashed border-border rounded-xl">
          <Table2 className="w-10 h-10 text-text-muted/40 mb-4" />
          <h2 className="text-base font-medium text-text-secondary mb-2">No cap table yet</h2>
          <p className="text-sm text-text-muted max-w-xs mb-6">
            Upload an opinionated CSV to render a structured cap table on this page.
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-xs text-white font-medium px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg transition-colors duration-150 cursor-pointer"
          >
            <Upload size={12} />
            Upload CSV
          </button>
        </div>

        <CapTableUploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onSuccess={refresh}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  // ── Full cap table view ───────────────────────────────────────────────────
  const isPublished = capTable.status === 'published';
  const uploadedDate = new Date(capTable.uploadedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <Link
        href={`/workspace/${workspaceId}`}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back to workspace
      </Link>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        {/* Title + status pill + timestamp */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Cap Table</h1>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-widest border ${
              isPublished
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-surface-sunken text-text-muted border-border'
            }`}
          >
            {capTable.status}
          </span>
          <span className="font-mono text-xs text-text-muted hidden sm:inline">{uploadedDate}</span>
        </div>

        {/* Admin action buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 border border-border hover:border-border/80 rounded-lg bg-transparent hover:bg-surface-sunken/50 transition-colors duration-150 cursor-pointer"
            >
              <Upload size={12} />
              Replace
            </button>
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 border border-border hover:border-border/80 rounded-lg bg-transparent hover:bg-surface-sunken/50 transition-colors duration-150 cursor-pointer"
            >
              <Download size={12} />
              Download
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-accent px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              <Trash2 size={12} /> Clear
            </button>
            {isPublished ? (
              <button
                onClick={togglePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 text-xs text-accent px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50"
              >
                <EyeOff size={12} />
                Unpublish
              </button>
            ) : (
              <button
                onClick={togglePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 text-xs text-white font-medium px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-50"
              >
                <Eye size={12} />
                Publish
              </button>
            )}
          </div>
        )}
      </div>

      {/* Warnings banner (admin only, collapsible) */}
      {isAdmin && capTable.parseWarnings.length > 0 && (
        <>
          <button
            onClick={() => setWarningsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border border-amber-800/50 bg-amber-950/20 rounded-lg mb-4 cursor-pointer hover:bg-amber-950/30 transition-colors duration-150"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-amber-300/80">
              <span className="font-mono">{capTable.parseWarnings.length}</span>
              parse warning{capTable.parseWarnings.length === 1 ? '' : 's'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-amber-500/60 transition-transform duration-150 ${warningsExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {warningsExpanded && (
            <div className="border-x border-b border-amber-800/50 bg-amber-950/10 rounded-b-lg px-4 py-3 -mt-0.5 mb-4">
              <ul className="space-y-0.5">
                {capTable.parseWarnings.map((w, i) => (
                  <li key={i} className="font-mono text-xs text-text-secondary py-0.5">
                    {w.row ? <span className="text-amber-400/70">Row {w.row}:</span> : null}
                    {w.row ? ' ' : ''}{w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Rounds summary */}
      <CapTableRoundsSummary rows={rows} />

      {/* Grouped rows */}
      <CapTableRowsView rows={rows} />

      {/* Upload modal */}
      <CapTableUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={refresh}
        workspaceId={workspaceId}
      />

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <ConfirmDialog
          open
          onClose={() => setShowClearConfirm(false)}
          onConfirm={async () => {
            setShowClearConfirm(false);
            await clearCapTable();
          }}
          title="Clear cap table?"
          description="This removes all cap table rows for this workspace. The original CSV file is preserved in storage; you can re-upload at any time. Item #5 'Cap table' on the playbook checklist will be reset to Not Started."
          confirmLabel="Clear"
          tone="destructive"
          preserves={['Original CSV file in storage', 'Activity log audit trail']}
        />
      )}
    </div>
  );
}
