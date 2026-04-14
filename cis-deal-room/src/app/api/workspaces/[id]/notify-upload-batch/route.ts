import { z } from 'zod';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  files,
  workspaces,
  folders,
  folderAccess,
  workspaceParticipants,
  users,
} from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';
import { enqueueOrSend } from '@/lib/notifications/enqueue-or-send';
import { UploadBatchNotificationEmail } from '@/lib/email/upload-batch';
import { canPerform, type ParticipantRole } from '@/lib/dal/permissions';

const bodySchema = z.object({
  folderId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { folderId, fileIds } = parsed;

  try {
    await requireFolderAccess(folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch file rows
  const fileRows = await db
    .select({ id: files.id, name: files.name, sizeBytes: files.sizeBytes })
    .from(files)
    .where(inArray(files.id, fileIds));

  if (fileRows.length === 0) {
    return Response.json({ error: 'No matching files' }, { status: 400 });
  }

  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const [folder] = await db
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.id, folderId));

  if (!workspace || !folder) {
    return Response.json({ error: 'Workspace or folder not found' }, { status: 404 });
  }

  // Fetch participants with download access to this folder (excluding uploader)
  const eligible = await db
    .select({
      email: users.email,
      userId: users.id,
      role: workspaceParticipants.role,
    })
    .from(folderAccess)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, folderAccess.participantId))
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(
      and(
        eq(folderAccess.folderId, folderId),
        eq(workspaceParticipants.status, 'active')
      )
    );

  const recipients = eligible.filter(
    (r) =>
      r.userId !== session.userId &&
      canPerform(r.role as ParticipantRole, 'download')
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const workspaceLink = `${appUrl}/deals/${workspaceId}`;

  // Send emails, tolerant of individual failures
  for (const recipient of recipients) {
    try {
      await enqueueOrSend({
        userId: recipient.userId,
        workspaceId,
        action: 'notified_batch',
        targetType: 'folder',
        targetId: folderId,
        metadata: {
          folderName: folder.name,
          workspaceName: workspace.name,
          files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
          uploaderEmail: session.userEmail,
        },
        immediateEmail: async () => ({
          to: recipient.email,
          subject: `${fileRows.length} new file${fileRows.length === 1 ? '' : 's'} in ${folder.name}`,
          react: UploadBatchNotificationEmail({
            workspaceName: workspace.name,
            folderName: folder.name,
            files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
            workspaceLink,
            uploaderEmail: session.userEmail,
          }),
        }),
      });
    } catch (err) {
      console.warn('[notify-upload-batch] send failure:', err);
    }
  }

  await logActivity(db, {
    workspaceId,
    userId: session.userId,
    action: 'notified_batch',
    targetType: 'folder',
    targetId: folderId,
    metadata: { fileIds, recipientCount: recipients.length },
  });

  return Response.json({ success: true, recipientCount: recipients.length });
}
