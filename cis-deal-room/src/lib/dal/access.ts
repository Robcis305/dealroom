import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, folderAccess, folders, fileWorkstreams, workstreamMembers, files } from '@/db/schema';
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

/**
 * File-scoped access as a UNION of two paths:
 *   (a) folder access: the user has a folder_access row on the file's folder
 *       AND their role permits `action`; OR
 *   (b) workstream membership: the user is an active member of a workstream
 *       that tags this file.
 * Membership is additive — it can only grant, never revoke.
 */
export async function requireFileAccess(
  fileId: string,
  session: Session,
  action: FolderAction,
): Promise<void> {
  if (session.isAdmin) return;

  // Path (a): folder access on the file's folder.
  const [folderRow] = await db
    .select({ role: workspaceParticipants.role })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .innerJoin(folderAccess, eq(folderAccess.folderId, folders.id))
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, folderAccess.participantId))
    .where(
      and(
        eq(files.id, fileId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (folderRow && canPerform(folderRow.role as ParticipantRole, action)) return;

  // Path (b): membership in any workstream tagging this file.
  const [memberRow] = await db
    .select({ id: workstreamMembers.workstreamId })
    .from(fileWorkstreams)
    .innerJoin(workstreamMembers, eq(workstreamMembers.workstreamId, fileWorkstreams.workstreamId))
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, workstreamMembers.participantId))
    .where(
      and(
        eq(fileWorkstreams.fileId, fileId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (memberRow) return;

  throw new Error('Unauthorized');
}
