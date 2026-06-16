'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { hasFolderAccess } from '@/lib/participants/folder-access';
import type { ParticipantRole } from '@/types';

interface ParticipantRow {
  id: string;
  role: ParticipantRole;
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

  const count = rows.filter((r) => hasFolderAccess(r, folderId)).length;
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`User access — ${count} ${count === 1 ? 'person has' : 'people have'} access. Open the participant list for this folder.`}
      title="See who has access to this folder"
      className="flex items-center gap-1.5 shrink-0 pl-2.5 pr-1.5 py-1 rounded-lg
        border border-border bg-surface text-text-secondary
        hover:bg-surface-elevated hover:text-text-primary hover:border-text-muted
        transition-colors cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Users size={14} className="shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium whitespace-nowrap">User access</span>
      <span
        className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full
          bg-surface-elevated text-text-secondary text-[10px] font-semibold leading-none tabular-nums"
        aria-hidden="true"
      >
        {count}
      </span>
    </button>
  );
}
