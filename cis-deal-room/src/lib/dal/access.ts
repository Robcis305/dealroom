import type { Session } from '@/types';

/**
 * Verify the session user has access to the given workspace.
 *
 * STUB: no-op in Phase 1. Phase 3 fills with real IDOR enforcement.
 *
 * Phase 3 implementation:
 *   SELECT from workspaceParticipants WHERE workspaceId AND userId = session.userId AND status = 'active'
 *   Throw 'Unauthorized' if no matching row found.
 *
 * Phase 2 file routes MUST call this before any file operation.
 */
export async function requireDealAccess(
  workspaceId: string,
  session: Session
): Promise<void> {
  // TODO (Phase 3): SELECT from workspaceParticipants WHERE workspaceId AND userId = session.userId AND status = 'active'
  // For now, all calls are permissive (no-op in Phase 1). Phase 3 replaces this body.
  void workspaceId;
  void session;
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
