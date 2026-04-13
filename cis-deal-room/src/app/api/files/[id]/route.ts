import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { verifySession } from '@/lib/dal/index';
import { getFileById, deleteFile } from '@/lib/dal/files';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: fileId } = await params;

  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  // Delete from S3 if bucket is configured
  if (S3_BUCKET) {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key })
    );
  }

  // Delete DB row + log activity (deleteFile DAL handles both)
  await deleteFile(fileId);

  return new Response(null, { status: 204 });
}
