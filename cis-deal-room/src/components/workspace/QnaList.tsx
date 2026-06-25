'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Clock } from 'lucide-react';
import clsx from 'clsx';
import type { QnaQuestionRow, QnaStatus } from '@/types';
import { QNA_STATUSES, QNA_STATUS_LABEL } from '@/lib/qna/constants';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { QnaStatusChip } from './QnaStatusChip';

// ─── Filter state ─────────────────────────────────────────────────────────────

interface FilterState {
  status: Set<QnaStatus>;
  workstream: Set<string>;
  assignee: Set<string>;
  overdueOnly: boolean;
}

function emptyFilters(initialWorkstreamId?: string): FilterState {
  return {
    status: new Set(),
    workstream: new Set(initialWorkstreamId ? [initialWorkstreamId] : []),
    assignee: new Set(),
    overdueOnly: false,
  };
}

function toggleFilterValue<K extends 'status' | 'workstream' | 'assignee'>(
  prev: FilterState,
  key: K,
  value: string,
): FilterState {
  const next: FilterState = {
    status: new Set(prev.status),
    workstream: new Set(prev.workstream),
    assignee: new Set(prev.assignee),
    overdueOnly: prev.overdueOnly,
  };
  const set = next[key] as Set<string>;
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return next;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  onOpenQuestion: (id: string) => void;
  onAsk: () => void;
  /** Pre-seed the workstream filter (e.g. opened from a workstream dashboard). */
  initialWorkstreamId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── ColumnHeader (multi-select dropdown) ─────────────────────────────────────

interface ColumnHeaderProps<V extends string> {
  label: string;
  options: Array<{ value: V; label: string }>;
  selected: Set<V>;
  onToggle: (value: V) => void;
}

function ColumnHeader<V extends string>({ label, options, selected, onToggle }: ColumnHeaderProps<V>) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;

  return (
    <div className="relative inline-flex items-center gap-1 select-none">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer',
          active ? 'text-accent' : 'text-text-muted hover:text-text-primary',
        )}
      >
        {label}
        {active && (
          <span className="inline-flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold w-4 h-4">
            {selected.size}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[180px] normal-case tracking-normal">
            <div className="max-h-60 overflow-y-auto">
              {options.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt.value)}
                      className="accent-accent"
                    />
                    <span className="text-text-primary">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── QnaList ─────────────────────────────────────────────────────────────────

export function QnaList({ workspaceId, onOpenQuestion, onAsk, initialWorkstreamId }: Props) {
  const [questions, setQuestions] = useState<QnaQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters(initialWorkstreamId));

  useEffect(() => {
    fetchWithAuth(`/api/workspaces/${workspaceId}/qna`)
      .then((r) => r.json())
      .then((data: { questions: QnaQuestionRow[] }) => setQuestions(data.questions))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  // ── Derived option lists ───────────────────────────────────────────────────

  const statusOptions = useMemo(
    () =>
      (QNA_STATUSES as readonly QnaStatus[]).filter((s) => questions.some((q) => q.status === s)),
    [questions],
  );

  const workstreamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) {
      for (const ws of q.workstreams) map.set(ws.id, ws.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [questions]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) {
      if (q.assigneeId && q.assigneeName) map.set(q.assigneeId, q.assigneeName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [questions]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filters.overdueOnly && !q.isOverdue) return false;
      if (filters.status.size > 0 && !filters.status.has(q.status)) return false;
      if (filters.workstream.size > 0 && !q.workstreams.some((ws) => filters.workstream.has(ws.id))) return false;
      if (filters.assignee.size > 0 && (!q.assigneeId || !filters.assignee.has(q.assigneeId))) return false;
      return true;
    });
  }, [questions, filters]);

  // ── Summary counts ────────────────────────────────────────────────────────

  const openCount = questions.filter((q) => q.status !== 'approved').length;
  const overdueCount = questions.filter((q) => q.isOverdue).length;
  const approvedCount = questions.filter((q) => q.status === 'approved').length;

  // ── Toggle helpers ────────────────────────────────────────────────────────

  function toggleStatus(v: QnaStatus) {
    setFilters((prev) => toggleFilterValue(prev, 'status', v));
  }
  function toggleWorkstream(v: string) {
    setFilters((prev) => toggleFilterValue(prev, 'workstream', v));
  }
  function toggleAssignee(v: string) {
    setFilters((prev) => toggleFilterValue(prev, 'assignee', v));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Q&A</h3>
          {!loading && (
            <p className="text-xs text-text-muted mt-0.5">
              {openCount} open
              {overdueCount > 0 && <span> · <span style={{ color: '#C8281F' }}>{overdueCount} overdue</span></span>}
              {' · '}{approvedCount} approved
            </p>
          )}
        </div>
        <button
          onClick={onAsk}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-accent text-text-inverse hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus size={14} />
          Ask a question
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <ColumnHeader
          label="Status"
          options={statusOptions.map((s) => ({ value: s, label: QNA_STATUS_LABEL[s] }))}
          selected={filters.status}
          onToggle={toggleStatus}
        />
        <ColumnHeader
          label="Workstream"
          options={workstreamOptions}
          selected={filters.workstream}
          onToggle={toggleWorkstream}
        />
        <ColumnHeader
          label="Assignee"
          options={assigneeOptions}
          selected={filters.assignee}
          onToggle={toggleAssignee}
        />
        <button
          onClick={() => setFilters((prev) => ({ ...prev, overdueOnly: !prev.overdueOnly }))}
          className={clsx(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
            filters.overdueOnly
              ? 'border-[#C8281F] bg-[#FBE5E4] text-[#C8281F]'
              : 'border-[#C8281F] text-[#C8281F] hover:bg-[#FBE5E4]',
          )}
        >
          <Clock size={11} />
          Overdue only
        </button>

        <span className="ml-auto font-mono text-xs text-text-muted">
          {filtered.length} of {questions.length}
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="py-8 text-sm text-text-muted">Loading…</p>
      ) : questions.length === 0 ? (
        <p className="py-8 text-sm text-text-muted">No questions yet.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header row */}
          <div
            className="grid text-xs font-medium uppercase tracking-wider text-text-muted border-b border-border bg-surface-elevated px-4 py-2"
            style={{ gridTemplateColumns: '130px 1fr 150px 150px 96px 110px' }}
          >
            <span>Status</span>
            <span>Question</span>
            <span>Workstream</span>
            <span>Assignee</span>
            <span>Asked</span>
            <span>Requested</span>
          </div>

          {/* Body rows */}
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-sm text-text-muted text-center">
              No questions match the current filters.
            </div>
          ) : (
            filtered.map((q) => (
              <button
                key={q.id}
                onClick={() => onOpenQuestion(q.id)}
                className={clsx(
                  'grid w-full text-left px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors cursor-pointer',
                  q.isOverdue && 'bg-[#FBE5E4]/30',
                )}
                style={{ gridTemplateColumns: '130px 1fr 150px 150px 96px 110px' }}
              >
                {/* Status */}
                <span className="flex items-center">
                  <QnaStatusChip status={q.status} overdue={q.isOverdue} />
                </span>

                {/* Question title */}
                <span className="text-sm text-text-primary pr-2 truncate">{q.title}</span>

                {/* Workstream */}
                <span className="flex flex-col gap-0.5">
                  {q.workstreams.length === 0 ? (
                    <span className="text-xs text-text-muted">—</span>
                  ) : (
                    q.workstreams.map((ws) => (
                      <span key={ws.id} className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ws.color }}
                        />
                        {ws.name}
                      </span>
                    ))
                  )}
                </span>

                {/* Assignee */}
                <span className="text-xs text-text-secondary">
                  {q.assigneeName ?? <span className="text-text-muted border-b border-dashed border-text-muted">Unassigned</span>}
                </span>

                {/* Asked date */}
                <span className="font-mono text-xs text-text-secondary">{fmtDate(q.askedAt)}</span>

                {/* Requested by date */}
                <span
                  className={clsx('font-mono text-xs inline-flex items-center gap-1')}
                  style={q.isOverdue ? { color: '#C8281F' } : undefined}
                >
                  {q.isOverdue && <Clock size={11} />}
                  <span className={!q.isOverdue ? 'text-text-secondary' : undefined}>
                    {fmtDate(q.requestedBy)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
