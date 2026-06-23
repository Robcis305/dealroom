'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, FileText, Lock, Globe } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { QnaQuestionDetail } from '@/types';
import { QnaStatusChip } from './QnaStatusChip';
import { QnaComposer } from './QnaComposer';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  questionId: string;
  isAdmin: boolean;
  canManage: boolean;
  currentUserId: string;
  participants: Participant[];
  onBack: () => void;
  onChanged: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ─── QnaDetail ───────────────────────────────────────────────────────────────

export function QnaDetail({
  workspaceId,
  questionId,
  isAdmin,
  canManage,
  currentUserId,
  participants,
  onBack,
  onChanged,
}: Props) {
  const [question, setQuestion] = useState<QnaQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  // ── Fetch detail ────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/qna/${questionId}`,
    );
    const data = await res.json();
    setQuestion(data.question as QnaQuestionDetail);
  }, [workspaceId, questionId]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function postReply(body: string): Promise<void> {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/qna/${questionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    await refresh();
    onChanged();
  }

  async function submitAnswer(body: string): Promise<void> {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/qna/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    await refresh();
    onChanged();
  }

  async function doApprovalAction(
    action: 'approve' | 'request_changes' | 'reroute',
    newAssigneeId?: string | null,
  ): Promise<void> {
    setActionPending(true);
    try {
      await fetchWithAuth(`/api/workspaces/${workspaceId}/qna/${questionId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'reroute' ? { newAssigneeId: newAssigneeId ?? null } : {}) }),
      });
      await refresh();
      onChanged();
    } finally {
      setActionPending(false);
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  if (!question) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-sm text-text-muted">
        Question not found.
      </div>
    );
  }

  const canAnswer = canManage || question.assigneeId === currentUserId;

  const showApprovalGate = question.approvalGateActive && isAdmin;

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 border-b border-border px-4"
        style={{ height: 58 }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
          aria-label="Back to Q&A list"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="text-sm text-text-muted">Q&amp;A</span>
        <span className="text-sm text-text-muted">&rsaquo;</span>
        <span className="flex-1 truncate text-sm font-medium text-text-primary">
          {question.title}
        </span>

        <QnaStatusChip status={question.status} overdue={question.isOverdue} />
      </div>

      {/* ── Two-column body ───────────────────────────────────────────────────── */}
      <div
        className="grid"
        style={{ gridTemplateColumns: showApprovalGate ? '1fr 392px' : '1fr' }}
      >
        {/* ── LEFT column ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 p-6 min-w-0">
          {/* Question title */}
          <h2 className="text-xl font-semibold text-text-primary leading-snug">
            {question.title}
          </h2>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {/* Workstream dots + labels */}
            {question.workstreams.map((ws) => (
              <span
                key={ws.id}
                className="inline-flex items-center gap-1"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ws.color }}
                />
                {ws.name}
              </span>
            ))}

            {/* Visibility pill */}
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
              {question.visibility === 'private' ? (
                <>
                  <Lock size={10} />
                  Private
                </>
              ) : (
                <>
                  <Globe size={10} />
                  Public
                </>
              )}
            </span>

            {/* Linked doc chip */}
            {question.linkedDocName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                <FileText size={10} />
                {question.linkedDocName}
              </span>
            )}

            {/* Requested by date */}
            {question.requestedBy && (
              <span className="text-text-muted">
                Requested by {fmtDate(question.requestedBy)}
              </span>
            )}
          </div>

          {/* Conversation */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Conversation
            </p>

            {question.thread.length === 0 ? (
              <p className="text-sm text-text-muted">No messages yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {question.thread.map((msg) => (
                  <div key={msg.id} className="flex gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-[10px] font-semibold text-text-secondary">
                      {initials(msg.authorName)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text-primary">
                          {msg.authorName}
                        </span>
                        <span className="font-mono text-xs text-text-muted">
                          {fmtTimestamp(msg.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </p>
                      {msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.attachments.map((a) => (
                            <span
                              key={a.fileId}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary"
                            >
                              <FileText size={10} />
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Proposed answer sub-card */}
            {question.proposedAnswer && (
              <div className="rounded-md border border-border bg-surface-elevated p-4 flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Proposed answer — submitted for CIS approval
                </p>
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {question.proposedAnswer.body}
                </p>
                {question.proposedAnswer.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {question.proposedAnswer.attachments.map((a) => (
                      <span
                        key={a.fileId}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary"
                      >
                        <FileText size={10} />
                        {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Composer */}
            {canAnswer ? (
              <>
                <QnaComposer
                  participants={participants}
                  placeholder="Add a reply or official answer…"
                  primary={{ label: 'Answer', onSubmit: submitAnswer }}
                  secondary={{ label: 'Chat', onSubmit: postReply }}
                />
                <p className="text-xs text-text-muted">
                  Chat to discuss or clarify · Answer is the official response — CIS reviews it before the asker sees it.
                </p>
              </>
            ) : (
              <>
                <QnaComposer
                  participants={participants}
                  placeholder="Add a clarification or follow-up…"
                  primary={{ label: 'Chat', onSubmit: postReply }}
                />
                <p className="text-xs text-text-muted">
                  Add a clarification or follow-up.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT column (approval gate + details) ─────────────────────────── */}
        {showApprovalGate && (
          <div className="border-l border-border flex flex-col gap-4 p-5">
            {/* Approval gate card */}
            <div
              className="rounded-md border border-border bg-surface-elevated flex flex-col gap-3 p-4"
              data-testid="approval-gate"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                Approval required — CIS gate
              </p>
              <p className="text-sm text-text-secondary">
                This proposed answer is pending your review before it is released to the asker.
              </p>

              {/* Primary action */}
              <button
                type="button"
                disabled={actionPending}
                onClick={() => doApprovalAction('approve')}
                className="w-full rounded-md bg-text-primary px-4 py-2 text-sm font-medium text-surface hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Approve &amp; release to asker
              </button>

              {/* Secondary actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => doApprovalAction('request_changes')}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-40"
                >
                  Request changes
                </button>
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => doApprovalAction('reroute', null)}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-40"
                >
                  Reroute
                </button>
              </div>
            </div>

            {/* Details list */}
            <DetailsPanel question={question} />
          </div>
        )}

      </div>

      {/* Details panel when no approval gate (non-admin or gate inactive) */}
      {!showApprovalGate && (
        <div className="border-t border-border px-6 py-4">
          <DetailsPanel question={question} />
        </div>
      )}
    </div>
  );
}

// ─── DetailsPanel ─────────────────────────────────────────────────────────────

function DetailsPanel({ question }: { question: QnaQuestionDetail }) {
  function row(label: string, value: React.ReactNode) {
    return (
      <div key={label} className="flex gap-2">
        <dt className="w-28 flex-shrink-0 text-xs text-text-muted">{label}</dt>
        <dd className="text-xs text-text-primary">{value}</dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
        Details
      </p>
      <dl className="flex flex-col gap-1.5">
        {row('Status', <QnaStatusChip status={question.status} overdue={question.isOverdue} />)}
        {row('Assignee', question.assigneeName ?? <span className="text-text-muted">Unassigned</span>)}
        {row(
          'Workstream',
          question.workstreams.length > 0
            ? question.workstreams.map((ws) => (
                <span key={ws.id} className="inline-flex items-center gap-1 mr-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: ws.color }}
                  />
                  {ws.name}
                </span>
              ))
            : <span className="text-text-muted">—</span>,
        )}
        {row(
          'Visibility',
          question.visibility === 'private' ? 'Private' : 'Public',
        )}
        {row('Asked', fmtDate(question.askedAt))}
        {row('Requested by', fmtDate(question.requestedBy))}
        {row(
          'Linked doc',
          question.linkedDocName ?? <span className="text-text-muted">—</span>,
        )}
      </dl>

      <p className="mt-3 text-xs text-text-muted leading-relaxed">
        Questions approved by CIS are released to the asker. Questions pending approval remain visible only to the deal team.
      </p>
    </div>
  );
}
