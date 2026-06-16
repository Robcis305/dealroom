'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { hasFolderAccess } from '@/lib/participants/folder-access';
import type { ParticipantRole } from '@/types';

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
  /** Incremented by the parent after invites/edits to trigger a refetch */
  refreshToken: number;
  /** Opens the side panel to the folder's participant list */
  onClick: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function FolderAccessIndicator({
  workspaceId,
  folderId,
  refreshToken,
  onClick,
}: FolderAccessIndicatorProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`);
      if (res.ok) setRows(await res.json());
    } catch {
      /* transient fetch failure — leave the indicator empty */
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const withAccess = rows.filter((r) => hasFolderAccess(r, folderId));
  if (withAccess.length === 0) return null;

  const shown = withAccess.slice(0, 4);
  const overflow = withAccess.length - shown.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Folder access — ${withAccess.length} with access. Open the participant list for this folder.`}
      title="See who has access to this folder"
      className="flex items-center gap-2 shrink-0 pl-2 pr-3 py-1 rounded-full
        border border-border bg-surface hover:bg-surface-elevated hover:border-text-muted
        transition-colors cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Users size={14} className="text-text-muted shrink-0" aria-hidden="true" />
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
      <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
        {withAccess.length} with access
      </span>
    </button>
  );
}
