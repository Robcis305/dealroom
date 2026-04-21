import { eq, and, inArray, max, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { folders, folderAccess, workspaceParticipants, checklistItems } from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns folders for a workspace, filtered by the user's access:
 * - Admin → all folders in the workspace.
 * - Non-admin → only folders they have a folder_access row for.
 *
 * Ordered by sortOrder ascending.
 */
export async function getFoldersForWorkspace(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (session.isAdmin) {
    return db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .orderBy(asc(folders.sortOrder));
  }

  // Non-admin: subquery of folderIds they have access to within this workspace
  const accessRows = await db
    .select({ folderId: folderAccess.folderId })
    .from(folderAccess)
    .innerJoin(
      workspaceParticipants,
      eq(workspaceParticipants.id, folderAccess.participantId)
    )
    .where(
      and(
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.status, 'active')
      )
    );

  const accessibleFolderIds = accessRows.map((r) => r.folderId);
  if (accessibleFolderIds.length === 0) return [];

  return db
    .select()
    .from(folders)
    .where(
      and(eq(folders.workspaceId, workspaceId), inArray(folders.id, accessibleFolderIds))
    )
    .orderBy(asc(folders.sortOrder));
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Creates a new folder in the workspace.
 * sortOrder is MAX(existing sortOrder) + 1 so it appears last.
 * Admin-only.
 */
export async function createFolder(workspaceId: string, name: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  // Compute next sortOrder
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(folders.sortOrder) })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId));

  const nextOrder = (maxOrder ?? -1) + 1;

  const [folder] = await db
    .insert(folders)
    .values({ workspaceId, name, sortOrder: nextOrder })
    .returning();

  await logActivity(db, {
    workspaceId,
    userId: session.userId,
    action: 'created_folder',
    targetType: 'folder',
    targetId: folder.id,
    metadata: { folderName: name },
  });

  return folder;
}

/**
 * Renames an existing folder.
 * Admin-only.
 */
export async function renameFolder(folderId: string, name: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  // Fetch folder to get workspaceId for activity log
  const [existing] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!existing) throw new Error('Folder not found');

  const [updated] = await db
    .update(folders)
    .set({ name, updatedAt: new Date() })
    .where(eq(folders.id, folderId))
    .returning();

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'renamed_folder',
    targetType: 'folder',
    targetId: folderId,
    metadata: { oldName: existing.name, newName: name },
  });

  return updated;
}

/**
 * Deletes a folder by ID.
 * Admin-only.
 */
export async function deleteFolder(folderId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  // Fetch folder to get workspaceId for activity log
  const [existing] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!existing) throw new Error('Folder not found');

  await db.transaction(async (tx) => {
    const [{ count: refCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(checklistItems)
      .where(eq(checklistItems.folderId, folderId));

    if (refCount > 0) {
      throw new Error(`FOLDER_IN_USE: ${refCount} checklist item(s) reference this folder`);
    }

    await tx.delete(folders).where(eq(folders.id, folderId));
  });

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'deleted',
    targetType: 'folder',
    targetId: folderId,
    metadata: { folderName: existing.name },
  });
}
