import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, folderAccess, folders } from '@/db/schema';
import { canPerform, type FolderAction, type ParticipantRole } from './permissions';
import type { Session } from '@/types';

/**
 * Verify the session user has access to the given workspace.
 *
 * Admin users bypass the check. Non-admins must have an active
 * workspace_participants row for this workspace.
 */
export async function requireDealAccess(
  workspaceId: string,
  session: Session
): Promise<void> {
  if (session.isAdmin) return;

  const [row] = await db
    .select({ id: workspaceParticipants.id })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (!row) throw new Error('Unauthorized');
}

/**
 * Verify the session user can perform the given action on the folder.
 *
 * Admin users bypass. Non-admins must (a) have a folder_access row for this
 * folder and (b) their participant role must permit the requested action.
 */
export async function requireFolderAccess(
  folderId: string,
  session: Session,
  action: FolderAction
): Promise<void> {
  if (session.isAdmin) return;

  const [row] = await db
    .select({ role: workspaceParticipants.role })
    .from(folderAccess)
    .innerJoin(folders, eq(folders.id, folderAccess.folderId))
    .innerJoin(
      workspaceParticipants,
      eq(workspaceParticipants.id, folderAccess.participantId)
    )
    .where(
      and(
        eq(folderAccess.folderId, folderId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (!row) throw new Error('Unauthorized');

  if (!canPerform(row.role as ParticipantRole, action)) {
    throw new Error('Forbidden');
  }
}
