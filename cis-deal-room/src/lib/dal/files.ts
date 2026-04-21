import { desc, eq, and, count, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders, users, checklistItems, checklistItemFiles } from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns a map of folderId → file count for the given folder IDs.
 * Folders with zero files are included in the result with count 0.
 */
export async function getFileCountsByFolder(
  folderIds: string[]
): Promise<Record<string, number>> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (folderIds.length === 0) return {};

  const rows = await db
    .select({
      folderId: files.folderId,
      count: count(files.id),
    })
    .from(files)
    .where(inArray(files.folderId, folderIds))
    .groupBy(files.folderId);

  // Seed every requested folder with 0 so the UI can render consistently
  const counts: Record<string, number> = Object.fromEntries(
    folderIds.map((id) => [id, 0])
  );
  for (const row of rows) counts[row.folderId] = Number(row.count);
  return counts;
}

/**
 * Returns all files for a folder ordered newest-first.
 * Requires an authenticated session.
 */
export async function getFilesForFolder(folderId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db
    .select({
      id: files.id,
      folderId: files.folderId,
      name: files.name,
      s3Key: files.s3Key,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      version: files.version,
      createdAt: files.createdAt,
      uploadedByEmail: users.email,
      uploadedByFirstName: users.firstName,
      uploadedByLastName: users.lastName,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploadedBy))
    .where(eq(files.folderId, folderId))
    .orderBy(desc(files.createdAt));
}

/**
 * Returns a single file row by ID, or null if not found.
 */
export async function getFileById(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  return file ?? null;
}

/**
 * Returns all versions of a file (matched by folderId + name) ordered newest-first.
 */
export async function getFileVersions(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [anchor] = await db
    .select({ folderId: files.folderId, name: files.name })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!anchor) return [];

  return db
    .select({
      id: files.id,
      version: files.version,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      s3Key: files.s3Key,
      createdAt: files.createdAt,
      uploadedByEmail: users.email,
      uploadedByFirstName: users.firstName,
      uploadedByLastName: users.lastName,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploadedBy))
    .where(and(eq(files.folderId, anchor.folderId), eq(files.name, anchor.name)))
    .orderBy(desc(files.version));
}

/**
 * Returns the most recent existing file with the same name in the folder, or null.
 * Used for duplicate detection before issuing a presigned upload URL.
 */
export async function checkDuplicate(folderId: string, name: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [existing] = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.name, name)))
    .orderBy(desc(files.version))
    .limit(1);

  return existing ?? null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Inserts a confirmed file row and logs the 'uploaded' activity.
 * Pass previousVersion when re-uploading an existing filename (versioning).
 */
export async function createFile(input: {
  folderId: string;
  name: string;
  s3Key: string;
  sizeBytes: number;
  mimeType: string;
  workspaceId: string;
  previousVersion?: number;
}) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const version = input.previousVersion != null ? input.previousVersion + 1 : 1;

  const [file] = await db
    .insert(files)
    .values({
      folderId: input.folderId,
      name: input.name,
      s3Key: input.s3Key,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      version,
      uploadedBy: session.userId,
    })
    .returning();

  await logActivity(db, {
    workspaceId: input.workspaceId,
    userId: session.userId,
    action: 'uploaded',
    targetType: 'file',
    targetId: file.id,
    metadata: { fileName: input.name, folderId: input.folderId, version },
  });

  return file;
}

/**
 * Deletes a file row by ID and logs the 'deleted' activity.
 * Fetches the file + parent folder in one join to get workspaceId for the activity log.
 * Admin-only. Does NOT delete the S3 object — the route handler does that.
 *
 * Checklist interactions:
 * 1. If the file is linked to any checklist item in a terminal state
 *    (received / waived / n_a), throw FILE_LOCKED_BY_CHECKLIST — the admin
 *    must reset the item's status before deleting, so the explicit "accepted"
 *    decision isn't silently undone.
 * 2. For non-terminal items that lose their last link as a result of this
 *    delete, revert in_progress → not_started. The DB cascade removes the
 *    checklist_item_files row, but the status revert is app-level.
 */
export async function deleteFile(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  // Fetch file + folder to get workspaceId
  const [row] = await db
    .select({ file: files, folder: folders })
    .from(files)
    .leftJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);

  if (!row) throw new Error('File not found');
  if (!row.folder) throw new Error('Folder not found');
  const folder = row.folder;

  // (1) Block if linked to any checklist item in a terminal state
  const lockedLinks = await db
    .select({
      itemName: checklistItems.name,
      status: checklistItems.status,
    })
    .from(checklistItemFiles)
    .innerJoin(checklistItems, eq(checklistItems.id, checklistItemFiles.itemId))
    .where(
      and(
        eq(checklistItemFiles.fileId, fileId),
        inArray(checklistItems.status, ['received', 'waived', 'n_a']),
      ),
    );

  if (lockedLinks.length > 0) {
    const names = lockedLinks.map((l) => `"${l.itemName}"`).join(', ');
    throw new Error(
      `FILE_LOCKED_BY_CHECKLIST: linked to ${names}. Reset the checklist item's status before deleting this file.`,
    );
  }

  // (2) Collect non-terminal items linked to this file so we can revert their
  // status after the DB cascade wipes the link rows.
  const affectedItems = await db
    .select({ itemId: checklistItemFiles.itemId })
    .from(checklistItemFiles)
    .where(eq(checklistItemFiles.fileId, fileId));
  const affectedItemIds = affectedItems.map((r) => r.itemId);

  await db.transaction(async (tx) => {
    await tx.delete(files).where(eq(files.id, fileId));

    for (const itemId of affectedItemIds) {
      const [{ count: linkCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(checklistItemFiles)
        .where(eq(checklistItemFiles.itemId, itemId));

      if (linkCount === 0) {
        const [item] = await tx
          .select({ status: checklistItems.status })
          .from(checklistItems)
          .where(eq(checklistItems.id, itemId))
          .limit(1);
        if (item?.status === 'in_progress') {
          await tx
            .update(checklistItems)
            .set({ status: 'not_started', updatedAt: new Date() })
            .where(eq(checklistItems.id, itemId));
        }
      }
    }

    await logActivity(tx, {
      workspaceId: folder.workspaceId,
      userId: session.userId,
      action: 'deleted',
      targetType: 'file',
      targetId: fileId,
      metadata: { fileName: row.file.name },
    });
  });

  return row.file;
}
