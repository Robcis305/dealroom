'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { assignableRolesFor } from '@/lib/participants/roles';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { CisAdvisorySide, ParticipantRole } from '@/types';

const GROUP_LABEL: Record<string, string> = {
  cap_table: 'Cap Table',
  eighty_three_b: '83(b) Filings',
  customer_coc: 'Customer COC',
  ip_assignment: 'IP Assignments',
  revenue_bridge: 'Revenue Bridge',
};

interface Folder {
  id: string;
  name: string;
}

interface ExistingParticipant {
  id: string;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
}

type ParticipantFormMode = 'invite' | 'edit';

interface ParticipantFormModalProps {
  mode: ParticipantFormMode;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  /** Required when mode === 'edit' */
  existing?: ExistingParticipant;
}

export function ParticipantFormModal({
  mode,
  open,
  onClose,
  onSuccess,
  workspaceId,
  cisAdvisorySide,
  folders,
  existing,
}: ParticipantFormModalProps) {
  const roleOptions = assignableRolesFor(cisAdvisorySide);
  const defaultRole: ParticipantRole = existing?.role ?? 'client';

  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<ParticipantRole>(defaultRole);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(existing?.folderIds ?? [])
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type Outstanding = { group: string; status: string; color: string };
  const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null);
  const [acknowledgement, setAcknowledgement] = useState('');

  function toggleFolder(folderId: string) {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);

    if (mode === 'invite' && !email.trim()) {
      setError('Email is required');
      return;
    }

    setSubmitting(true);

    const url =
      mode === 'invite'
        ? `/api/workspaces/${workspaceId}/participants`
        : `/api/workspaces/${workspaceId}/participants/${existing!.id}`;
    const method = mode === 'invite' ? 'POST' : 'PATCH';
    const body =
      mode === 'invite'
        ? {
            email: email.trim(),
            role,
            folderIds: Array.from(selectedFolderIds),
            ...(acknowledgement ? { acknowledgement } : {}),
          }
        : {
            role,
            folderIds: Array.from(selectedFolderIds),
          };

    try {
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        if (res.status === 409 && Array.isArray(data?.outstanding)) {
          setOutstanding(data.outstanding);
          return;
        }
        const message =
          typeof data.error === 'string'
            ? data.error
            : Array.isArray(data.error)
              ? 'Validation error'
              : 'Request failed';
        setError(message);
        return;
      }

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setEmail(existing?.email ?? '');
    setRole(defaultRole);
    setSelectedFolderIds(new Set(existing?.folderIds ?? []));
    setError(null);
    setOutstanding(null);
    setAcknowledgement('');
    onClose();
  }

  const title = mode === 'invite' ? 'Invite Participant' : 'Edit Participant';
  const submitLabel = mode === 'invite' ? 'Send Invitation' : 'Save Changes';

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <div>
          <label htmlFor="participant-email" className="block text-sm font-medium text-text-secondary mb-1.5">
            Email
          </label>
          <input
            id="participant-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={mode === 'edit' || submitting}
            className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
              text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="participant-role" className="block text-sm font-medium text-text-secondary mb-1.5">
            Role
          </label>
          <select
            id="participant-role"
            value={role}
            onChange={(e) => {
              const next = e.target.value as ParticipantRole;
              setRole(next);
            }}
            disabled={submitting}
            className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
              text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

        </div>

        <div>
          <p className="block text-sm font-medium text-text-secondary mb-1.5">Folder access</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {folders.map((folder) => (
              <label key={folder.id} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={folder.name}
                  checked={selectedFolderIds.has(folder.id)}
                  onChange={() => toggleFolder(folder.id)}
                  disabled={submitting}
                  className="rounded bg-surface-sunken border-border accent-accent"
                />
                {folder.name}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        {outstanding && (
          <div className="mt-4 p-4 border border-accent/40 bg-accent/10 rounded-lg">
            <h3 className="text-sm font-semibold text-accent mb-2">
              {outstanding.length} deal-killer{outstanding.length === 1 ? '' : 's'} outstanding
            </h3>
            <p className="text-sm text-text-secondary mb-3">
              You&apos;re inviting a buyer-side participant before resolving:
            </p>
            <ul className="text-xs text-text-secondary mb-3 space-y-1">
              {outstanding.map((o) => (
                <li key={o.group} className="font-mono">
                  • {GROUP_LABEL[o.group] ?? o.group}
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted mb-2">
              Type <span className="font-mono text-text-primary">share anyway</span> to proceed.
            </p>
            <input
              type="text"
              value={acknowledgement}
              onChange={(e) => setAcknowledgement(e.target.value)}
              placeholder="share anyway"
              className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
                text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-sunken text-text-secondary
              hover:bg-surface-elevated transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!(!submitting && (outstanding === null || acknowledgement.trim().toLowerCase() === 'share anyway'))}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-accent text-text-inverse
              hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
