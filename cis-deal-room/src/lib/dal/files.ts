import { desc, eq, and, count, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders, users } from '@/db/schema';
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

  await db.delete(files).where(eq(files.id, fileId));

  await logActivity(db, {
    workspaceId: row.folder.workspaceId,
    userId: session.userId,
    action: 'deleted',
    targetType: 'file',
    targetId: fileId,
    metadata: { fileName: row.file.name },
  });

  return row.file;
}
