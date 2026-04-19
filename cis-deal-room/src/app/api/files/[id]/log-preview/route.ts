import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';
import { previewLogLimiter } from '@/lib/auth/rate-limit';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: fileId } = await params;

  const rows = await db
    .select({
      id: files.id,
      folderId: files.folderId,
      workspaceId: folders.workspaceId,
    })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const file = rows[0];

  const identifier = `${session.userId}:${file.id}`;
  const { success } = await previewLogLimiter.limit(identifier);
  if (!success) return new Response(null, { status: 204 }); // silent drop

  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await logActivity(db, {
    workspaceId: file.workspaceId,
    userId: session.userId,
    action: 'previewed',
    targetType: 'file',
    targetId: file.id,
  });

  return Response.json({ ok: true });
}
