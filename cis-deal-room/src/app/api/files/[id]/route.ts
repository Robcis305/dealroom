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

  // DB delete first — if this throws FILE_LOCKED_BY_CHECKLIST we abort before
  // touching S3 (keeps storage consistent with DB).
  try {
    await deleteFile(fileId);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('FILE_LOCKED_BY_CHECKLIST:')) {
      return Response.json(
        { error: e.message.slice('FILE_LOCKED_BY_CHECKLIST: '.length) },
        { status: 409 },
      );
    }
    throw e;
  }

  // Delete from S3 after DB commit
  if (S3_BUCKET) {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key })
    );
  }

  return new Response(null, { status: 204 });
}
