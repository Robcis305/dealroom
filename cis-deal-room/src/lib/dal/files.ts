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
 * For each provided fileId, returns the terminal-state checklist items
 * blocking its deletion. Used by the delete-preflight endpoint so the UI
 * can fail fast without waiting for the 10s soft-delete window.
 */
export async function getChecklistLocksForFiles(fileIds: string[]) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (fileIds.length === 0) return [];

  return db
    .select({
      fileId: checklistItemFiles.fileId,
      fileName: files.name,
      itemName: checklistItems.name,
      status: checklistItems.status,
    })
    .from(checklistItemFiles)
    .innerJoin(checklistItems, eq(checklistItems.id, checklistItemFiles.itemId))
    .innerJoin(files, eq(files.id, checklistItemFiles.fileId))
    .where(
      and(
        inArray(checklistItemFiles.fileId, fileIds),
        inArray(checklistItems.status, ['received', 'waived', 'n_a']),
      ),
    );
}

/**
 * Load file metadata for a bulk download. Returns rows in the SAME order as
 * the input ids (for the zip's stable ordering). Includes workspaceId so the
 * caller can authorize and log activity.
 *
 * Files not found are silently skipped — the caller should compare the
 * returned row count to the input count if it cares about partial misses.
 */
export async function getFilesForBulkDownload(fileIds: string[]) {
  if (fileIds.length === 0) return [];

  const rows = await db
    .select({
      id: files.id,
      name: files.name,
      s3Key: files.s3Key,
      folderId: files.folderId,
      workspaceId: folders.workspaceId,
    })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .where(inArray(files.id, fileIds));

  // Preserve input order
  const byId = new Map(rows.map((r) => [r.id, r]));
  return fileIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
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

// ─── Move ─────────────────────────────────────────────────────────────────────

interface MoveFilesInput {
  fileIds: string[];
  destinationFolderId: string;
}

interface MoveFilesResult {
  moved: string[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Bulk-move files into a destination folder. Admin-only.
 *
 * Validates that every file exists and belongs to the same workspace as
 * the destination folder. Files in different workspaces, or referencing
 * a missing destination, are returned in `failed` rather than failing
 * the whole batch.
 *
 * Each successful move emits one `file_moved` activity log entry whose
 * metadata records the source folder. The whole operation runs in a
 * single transaction.
 */
export async function moveFiles(input: MoveFilesInput): Promise<MoveFilesResult> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  if (input.fileIds.length === 0) return { moved: [], failed: [] };

  return db.transaction(async (tx) => {
    // Resolve the destination folder + its workspace
    const [dest] = await tx
      .select({ id: folders.id, workspaceId: folders.workspaceId })
      .from(folders)
      .where(eq(folders.id, input.destinationFolderId))
      .limit(1);
    if (!dest) {
      return {
        moved: [],
        failed: input.fileIds.map((id) => ({ id, reason: 'destination not found' })),
      };
    }

    // Look up every file's current folder + workspace
    const rows = await tx
      .select({
        id: files.id,
        folderId: files.folderId,
        folderWorkspaceId: folders.workspaceId,
      })
      .from(files)
      .innerJoin(folders, eq(folders.id, files.folderId))
      .where(inArray(files.id, input.fileIds));

    const moved: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];
    const seen = new Set<string>(rows.map((r) => r.id));

    for (const id of input.fileIds) {
      if (!seen.has(id)) failed.push({ id, reason: 'file not found' });
    }

    const toMove: Array<{ id: string; sourceFolderId: string }> = [];
    for (const row of rows) {
      if (row.folderWorkspaceId !== dest.workspaceId) {
        failed.push({ id: row.id, reason: 'cross-workspace move not allowed' });
        continue;
      }
      if (row.folderId === dest.id) {
        // Already in the destination — treat as a no-op success
        moved.push(row.id);
        continue;
      }
      toMove.push({ id: row.id, sourceFolderId: row.folderId });
    }

    if (toMove.length > 0) {
      await tx
        .update(files)
        .set({ folderId: dest.id })
        .where(inArray(files.id, toMove.map((m) => m.id)));

      for (const m of toMove) {
        await logActivity(tx, {
          workspaceId: dest.workspaceId,
          userId: session.userId,
          action: 'file_moved',
          targetType: 'file',
          targetId: m.id,
          metadata: {
            sourceFolderId: m.sourceFolderId,
            destinationFolderId: dest.id,
          },
        });
        moved.push(m.id);
      }
    }

    return { moved, failed };
  });
}
