'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { roleLabel } from '@/lib/participants/roles';
import { hasFolderAccess, isFullAccessRole } from '@/lib/participants/folder-access';
import type { CisAdvisorySide, ParticipantRole } from '@/types';

interface ParticipantRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ParticipantRole;
  status: string;
  folderIds: string[];
}

interface FolderAccessIndicatorProps {
  workspaceId: string;
  folderId: string;
  cisAdvisorySide: CisAdvisorySide;
  /** Incremented by the parent after invites/edits to trigger a refetch */
  refreshToken: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function FolderAccessIndicator({
  workspaceId,
  folderId,
  cisAdvisorySide,
  refreshToken,
}: FolderAccessIndicatorProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`);
    if (res.ok) setRows(await res.json());
  }, [workspaceId]);

  useEffect(() => { load(); }, [load, refreshToken]);
  // Close the popover whenever the open folder changes
  useEffect(() => { setOpen(false); }, [folderId]);

  const withAccess = rows.filter((r) => hasFolderAccess(r, folderId));
  if (withAccess.length === 0) return null;

  const shown = withAccess.slice(0, 4);
  const overflow = withAccess.length - shown.length;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Users with access to this folder"
        aria-expanded={open}
        title="Users with access to this folder"
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-elevated
          transition-colors cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex -space-x-2">
          {shown.map((r) => (
            <span
              key={r.id}
              className="w-6 h-6 rounded-full bg-surface-elevated border border-border
                flex items-center justify-center text-[10px] font-semibold text-text-secondary"
            >
              {initials(displayName(r))}
            </span>
          ))}
          {overflow > 0 && (
            <span className="w-6 h-6 rounded-full bg-surface-elevated border border-border
              flex items-center justify-center text-[10px] font-semibold text-text-secondary">
              +{overflow}
            </span>
          )}
        </span>
        <span className="text-xs text-text-muted whitespace-nowrap">
          {withAccess.length} with access
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 mt-2 w-64 z-20 bg-surface border border-border
            rounded-lg shadow-lg p-2">
            <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-text-secondary">
              <Users size={12} aria-hidden="true" />
              Users with access to this folder
            </p>
            <ul className="mt-1 space-y-0.5 max-h-72 overflow-y-auto">
              {withAccess.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md
                    hover:bg-surface-elevated"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary truncate">{displayName(r)}</span>
                    <span className="block text-xs text-text-muted truncate">
                      {roleLabel(r.role, cisAdvisorySide)}
                    </span>
                  </span>
                  {isFullAccessRole(r.role) ? (
                    <span className="shrink-0 text-[10px] font-medium text-text-muted
                      border border-border rounded px-1.5 py-0.5">
                      Full access
                    </span>
                  ) : r.status === 'invited' ? (
                    <span className="shrink-0 text-[10px] font-medium text-text-secondary
                      border border-border rounded px-1.5 py-0.5">
                      Invited
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
