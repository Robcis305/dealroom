import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { logActivity } from '@/lib/dal/activity';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { db } from '@/db';
import { folders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireFolderAccess } from '@/lib/dal/access';
import { buildContentDisposition } from '@/lib/storage/content-disposition';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: fileId } = await params;
  const url = new URL(request.url);
  const disposition = url.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve workspaceId for activity log (required by uuid column, even in stub mode)
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, file.folderId))
    .limit(1);

  if (!folder) return Response.json({ error: 'Folder not found' }, { status: 404 });

  // S3 stub — return placeholder URL when bucket is not configured.
  if (!S3_BUCKET) {
    if (disposition === 'attachment') {
      await logActivity(db, {
        workspaceId: folder.workspaceId,
        userId: session.userId,
        action: 'downloaded',
        targetType: 'file',
        targetId: file.id,
        metadata: { fileName: file.name, stub: true },
      });
    }

    return Response.json({
      url: `stub://download/${file.s3Key}`,
      fileName: file.name,
    });
  }

  const signedUrl = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: file.s3Key,
      ResponseContentDisposition: buildContentDisposition(disposition, file.name),
      ...(disposition === 'inline' ? { ResponseContentType: file.mimeType } : {}),
    }),
    { expiresIn: 15 * 60 } // 15 minutes
  );

  if (disposition === 'attachment') {
    await logActivity(db, {
      workspaceId: folder.workspaceId,
      userId: session.userId,
      action: 'downloaded',
      targetType: 'file',
      targetId: file.id,
      metadata: { fileName: file.name },
    });
  }

  return Response.json({ url: signedUrl, fileName: file.name });
}
