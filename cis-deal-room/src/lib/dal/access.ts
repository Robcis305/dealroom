import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants } from '@/db/schema';
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
 * Verify the session user has access to the given folder.
 *
 * STUB: no-op in Phase 1. Phase 3 fills with real IDOR enforcement.
 *
 * Phase 3 implementation:
 *   SELECT from folderAccess WHERE folderId AND participantId matches session.userId
 *   Throw 'Unauthorized' if no matching row found.
 *
 * Phase 2 file routes MUST call this before returning file listings.
 */
export async function requireFolderAccess(
  folderId: string,
  session: Session
): Promise<void> {
  // TODO (Phase 3): SELECT from folderAccess WHERE folderId AND participantId matches session.userId
  void folderId;
  void session;
}
