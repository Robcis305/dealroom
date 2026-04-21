'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { assignableRolesFor } from '@/lib/participants/roles';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { CisAdvisorySide, ParticipantRole } from '@/types';

interface Folder {
  id: string;
  name: string;
}

interface ExistingParticipant {
  id: string;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
  viewOnlyShadowSide?: 'buyer' | 'seller' | null;
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
  const [viewOnlyShadowSide, setViewOnlyShadowSide] = useState<'buyer' | 'seller' | ''>(
    existing?.viewOnlyShadowSide ?? ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (role === 'view_only' && !viewOnlyShadowSide) {
      setError('"View as" side is required for View Only participants');
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
            viewOnlyShadowSide: role === 'view_only' ? viewOnlyShadowSide : null,
          }
        : {
            role,
            folderIds: Array.from(selectedFolderIds),
            viewOnlyShadowSide: role === 'view_only' ? viewOnlyShadowSide : null,
          };

    try {
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
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
    setViewOnlyShadowSide(existing?.viewOnlyShadowSide ?? '');
    setError(null);
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
              if (next !== 'view_only') setViewOnlyShadowSide('');
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

          {role === 'view_only' && (
            <div className="mt-3">
              <label
                htmlFor="participant-shadow-side"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                View as (required)
              </label>
              <select
                id="participant-shadow-side"
                value={viewOnlyShadowSide}
                onChange={(e) => setViewOnlyShadowSide(e.target.value as 'buyer' | 'seller' | '')}
                disabled={submitting}
                className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
                  text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select…</option>
                <option value="buyer">Buyer side</option>
                <option value="seller">Seller side</option>
              </select>
            </div>
          )}
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
            disabled={submitting}
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
