import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { logActivity } from '@/lib/dal/activity';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { db } from '@/db';
import { folders } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: fileId } = await params;

  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  // S3 stub — return placeholder URL when bucket is not configured.
  // Skip the folder lookup in stub mode; activity log uses 'stub' workspaceId.
  if (!S3_BUCKET) {
    await logActivity(db, {
      workspaceId: 'stub',
      userId: session.userId,
      action: 'downloaded',
      targetType: 'file',
      targetId: file.id,
      metadata: { fileName: file.name },
    });

    return Response.json({
      url: `stub://download/${file.s3Key}`,
      fileName: file.name,
    });
  }

  // Real path — resolve workspaceId for activity log
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, file.folderId))
    .limit(1);

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: file.s3Key,
      ResponseContentDisposition: `attachment; filename="${file.name}"`,
    }),
    { expiresIn: 15 * 60 } // 15 minutes
  );

  await logActivity(db, {
    workspaceId: folder.workspaceId,
    userId: session.userId,
    action: 'downloaded',
    targetType: 'file',
    targetId: file.id,
    metadata: { fileName: file.name },
  });

  return Response.json({ url, fileName: file.name });
}
