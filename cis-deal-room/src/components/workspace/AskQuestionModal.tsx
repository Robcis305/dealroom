'use client';

import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Folder {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  folders: Folder[];
  onClose: () => void;
  onCreated: (newId: string) => void;
}

interface Workstream {
  id: string;
  name: string;
  color: string;
}

// The participants endpoint returns rows with both id (participant id) and userId (user id).
// For recipients we use participant.id; for assigneeId (user FK in qna_questions) we use participant.userId.
interface Participant {
  id: string;       // workspace_participants.id — used for recipientParticipantIds
  userId: string;   // users.id — used for assigneeId
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

export function AskQuestionModal({ workspaceId, folders, onClose, onCreated }: Props) {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Form state
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());
  const [assigneeParticipantId, setAssigneeParticipantId] = useState(''); // participant id → we resolve to userId on submit
  const [requestedBy, setRequestedBy] = useState('');
  const [linkedDocId, setLinkedDocId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [wsRes, pRes] = await Promise.all([
      fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams`),
      fetchWithAuth(`/api/workspaces/${workspaceId}/participants`),
    ]);
    if (wsRes.ok) {
      const data = await wsRes.json();
      setWorkstreams(data.workstreams ?? []);
    }
    if (pRes.ok) {
      const data = await pRes.json();
      setParticipants(Array.isArray(data) ? data : data.participants ?? []);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  function toggleRecipient(participantId: string) {
    setRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  function participantName(p: Participant) {
    return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
  }

  // Derive files from folders prop — v1: no per-folder file fetch; the modal
  // accepts the folder list (which WorkspaceShell already holds) and lets the
  // user pick a folder as a linked doc proxy. If a flat file list is needed in
  // future, swap this for a GET /api/workspaces/:id/files call.
  // NOTE: folders stand in for documents here; we send folder.id as linkedDocId.
  // The qna_questions.linked_doc_id column is typed as a file FK so this will
  // only be sent when a real file select is wired up — for now the select is
  // optional and the field is sent as null when empty.
  //
  // LIMITATION: No workspace-level flat file endpoint exists at time of writing.
  // The document picker lists folders as proxy labels. A future task should add
  // GET /api/workspaces/:id/files to power this properly.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Question is required.'); return; }

    setSubmitting(true);
    setError(null);

    // Resolve assigneeId: find the selected participant and use their userId
    const assigneeParticipant = participants.find((p) => p.id === assigneeParticipantId);
    const assigneeId = assigneeParticipant?.userId ?? null;

    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/qna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          workstreamIds: selectedWorkstreamId ? [selectedWorkstreamId] : [],
          assigneeId,
          requestedBy: requestedBy || null,
          visibility,
          recipientParticipantIds: visibility === 'private' ? Array.from(recipientIds) : [],
          linkedDocId: linkedDocId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'Failed to submit question.');
        return;
      }

      const { id } = await res.json();
      onCreated(id);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,10,10,0.42)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-[10px] w-[640px] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">Ask a question</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 flex flex-col gap-4">

          {/* Workstream */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Workstream</label>
            <select
              value={selectedWorkstreamId}
              onChange={(e) => setSelectedWorkstreamId(e.target.value)}
              className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="">— none —</option>
              {workstreams.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            {/* Color dot preview next to selected workstream name */}
            {selectedWorkstreamId && (() => {
              const ws = workstreams.find((w) => w.id === selectedWorkstreamId);
              return ws ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ws.color }} aria-hidden="true" />
                  <span className="text-xs text-text-secondary">{ws.name}</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Question */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Question</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              placeholder="What would you like to ask?"
              className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              required
            />
          </div>

          {/* Visibility toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Visibility</label>
            <div className="inline-flex rounded-md border border-border overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  visibility === 'public'
                    ? 'bg-text-primary text-surface'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`px-4 py-1.5 text-sm font-medium border-l border-border transition-colors cursor-pointer ${
                  visibility === 'private'
                    ? 'bg-text-primary text-surface'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Private
              </button>
            </div>
          </div>

          {/* Recipient chip picker — only when Private */}
          {visibility === 'private' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Recipients</label>
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => {
                  const selected = recipientIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleRecipient(p.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-accent text-text-inverse border-accent'
                          : 'border-border text-text-secondary hover:border-accent hover:text-text-primary'
                      }`}
                    >
                      {participantName(p)}
                    </button>
                  );
                })}
                {participants.length === 0 && (
                  <span className="text-xs text-text-muted">No participants found.</span>
                )}
              </div>
            </div>
          )}

          {/* Two-up: Proposed assignee + Response requested by */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Proposed assignee</label>
              <select
                value={assigneeParticipantId}
                onChange={(e) => setAssigneeParticipantId(e.target.value)}
                className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              >
                <option value="">— optional —</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantName(p)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Response requested by</label>
              <input
                type="date"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                className="w-full text-sm font-mono bg-surface border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Link a document — optional */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Link a document — optional
            </label>
            {/* v1: flat file fetch unavailable; listing folders as proxy.
                linkedDocId is sent as null if not selected (no file FK violation).
                TODO: wire up GET /api/workspaces/:id/files for real file list. */}
            <select
              value={linkedDocId}
              onChange={(e) => setLinkedDocId(e.target.value)}
              className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="">— none —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">Showing folders. File-level picker coming in a future update.</p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm px-4 py-2 rounded-md bg-accent text-text-inverse font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Submitting…' : 'Submit question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
