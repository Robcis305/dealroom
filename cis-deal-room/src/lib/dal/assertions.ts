import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { folders, files, workspaceParticipants } from '@/db/schema';

export async function assertFolderInWorkspace(folderId: string, workspaceId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: folders.workspaceId })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  if (!row) throw new Error('Not found');
  if (row.workspaceId !== workspaceId) throw new Error('Forbidden');
}

export async function assertParticipantInWorkspace(
  participantId: string,
  workspaceId: string
): Promise<void> {
  const [row] = await db
    .select({ workspaceId: workspaceParticipants.workspaceId })
    .from(workspaceParticipants)
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);
  if (!row) throw new Error('Not found');
  if (row.workspaceId !== workspaceId) throw new Error('Forbidden');
}

export async function assertFileInWorkspace(fileId: string, workspaceId: string): Promise<void> {
  const [row] = await db
    .select({ workspaceId: folders.workspaceId })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);
  if (!row) throw new Error('Not found');
  if (row.workspaceId !== workspaceId) throw new Error('Forbidden');
}
