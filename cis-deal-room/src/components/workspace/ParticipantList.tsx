'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { roleLabel } from '@/lib/participants/roles';
import { displayName } from '@/lib/users/display';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { formatRelative } from '@/lib/format-date';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ParticipantFormModal } from './ParticipantFormModal';
import type { CisAdvisorySide, ParticipantRole } from '@/types';

interface Folder {
  id: string;
  name: string;
}

interface ParticipantRow {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ParticipantRole;
  status: string;
  invitedAt: string | Date;
  activatedAt: string | Date | null;
  folderIds: string[];
  lastSeen: string | Date | null;
  viewOnlyShadowSide: 'buyer' | 'seller' | null;
}

interface ParticipantListProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  isAdmin: boolean;
  /** Parent increments to force a refetch (e.g., after an invite succeeds) */
  refreshToken: number;
  /** Current viewer's email — the row matching this hides its edit/revoke buttons */
  currentUserEmail: string;
}

export function ParticipantList({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  refreshToken,
  currentUserEmail,
}: ParticipantListProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [revoking, setRevoking] = useState<ParticipantRow | null>(null);
  const [bump, setBump] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load, refreshToken, bump]);

  async function handleRemove(participant: ParticipantRow) {
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/participants/${participant.id}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      setBump((n) => n + 1);
      toast.success(`${participant.email} no longer has access`);
      return;
    }

    // Surface the server's error string when available (e.g. "Cannot remove self")
    let message = 'Failed to remove participant';
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') {
        message =
          body.error === 'Cannot remove self'
            ? "You can't revoke your own access — ask another admin."
            : body.error;
      }
    } catch {
      /* body wasn't JSON; keep generic message */
    }
    toast.error(message);
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <button
          onClick={() => setShowInvite(true)}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover
            text-text-inverse text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <UserPlus size={14} />
          Invite Participant
        </button>
      )}

      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-muted">No participants yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 bg-surface border border-border rounded-md px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate font-medium">
                  {displayName(row)}
                </p>
                {isAdmin && displayName(row) !== row.email && (
                  <p className="text-xs text-text-muted truncate">{row.email}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {/* Inline status badge — Badge component only accepts WorkspaceStatus values */}
                  <span className={clsx(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                    row.status === 'active'
                      ? 'bg-success-subtle text-success border-success/30'
                      : 'bg-surface-sunken text-text-secondary border-border'
                  )}>
                    {row.status === 'active' ? 'Active' : 'Invited'}
                  </span>
                  <span className="text-xs text-text-muted">
                    {roleLabel(row.role, cisAdvisorySide)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {row.status === 'active' && row.lastSeen
                      ? `last seen ${formatRelative(row.lastSeen)}`
                      : row.status === 'invited'
                        ? 'not yet accepted'
                        : null}
                  </span>
                </div>
              </div>
              {isAdmin && row.email !== currentUserEmail && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    aria-label={`Edit ${row.email}`}
                    onClick={() => setEditing(row)}
                    className="w-8 h-8 rounded flex items-center justify-center
                      text-text-muted hover:text-text-primary hover:bg-surface-elevated
                      transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Edit participant"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Revoke access for ${row.email}`}
                    onClick={() => setRevoking(row)}
                    className="w-8 h-8 rounded flex items-center justify-center
                      text-text-muted hover:text-danger hover:bg-surface-elevated
                      transition-colors cursor-pointer
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Revoke access"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showInvite && (
        <ParticipantFormModal
          mode="invite"
          open={showInvite}
          onClose={() => setShowInvite(false)}
          onSuccess={() => setBump((n) => n + 1)}
          workspaceId={workspaceId}
          cisAdvisorySide={cisAdvisorySide}
          folders={folders}
        />
      )}

      {editing && (
        <ParticipantFormModal
          mode="edit"
          open={!!editing}
          onClose={() => setEditing(null)}
          onSuccess={() => setBump((n) => n + 1)}
          workspaceId={workspaceId}
          cisAdvisorySide={cisAdvisorySide}
          folders={folders}
          existing={{
            id: editing.id,
            email: editing.email,
            role: editing.role,
            folderIds: editing.folderIds,
            viewOnlyShadowSide: editing.viewOnlyShadowSide,
          }}
        />
      )}

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await handleRemove(revoking);
          setRevoking(null);
        }}
        title={revoking ? `Revoke access for ${revoking.email}?` : ''}
        description="They lose access to this workspace immediately and receive no notification."
        preserves={[
          'Their activity history remains in the audit log',
          'Any files they uploaded stay in the workspace',
        ]}
        requireTypedValue={revoking?.email}
        typedValueLabel="Type the email to confirm"
        confirmLabel="Revoke access"
        tone="destructive"
      />
    </div>
  );
}


