'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { roleLabel } from '@/lib/participants/roles';
import { displayName } from '@/lib/users/display';
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
}

interface ParticipantListProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  isAdmin: boolean;
  /** Parent increments to force a refetch (e.g., after an invite succeeds) */
  refreshToken: number;
}

export function ParticipantList({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  refreshToken,
}: ParticipantListProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [bump, setBump] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/participants`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load, refreshToken, bump]);

  async function handleRemove(participantId: string, email: string) {
    if (!confirm(`Remove ${email} from this workspace?`)) return;
    const res = await fetch(
      `/api/workspaces/${workspaceId}/participants/${participantId}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      setBump((n) => n + 1);
      toast.success('Participant removed');
    } else {
      toast.error('Failed to remove participant');
    }
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
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    aria-label={`Edit ${row.email}`}
                    onClick={() => setEditing(row)}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label={`Remove ${row.email}`}
                    onClick={() => handleRemove(row.id, row.email)}
                    className="p-1 text-text-muted hover:text-danger transition-colors"
                  >
                    <X size={14} />
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
          }}
        />
      )}
    </div>
  );
}

function formatRelative(ts: string | Date): string {
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

