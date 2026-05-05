import { verifySession } from '@/lib/dal/index';
import { deleteFile } from '@/lib/dal/files';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: fileId } = await params;

  // Soft-delete only: the S3 object is intentionally preserved so a subsequent
  // /restore call (within the undo window) recovers the file. Hard-delete and
  // S3 cleanup are handled by scripts/hard-delete-expired.mjs (deferred).
  try {
    await deleteFile(fileId);
  } catch (e) {
    if (e instanceof Error && e.message === 'File not found') {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith('FILE_LOCKED_BY_CHECKLIST:')) {
      return Response.json(
        { error: e.message.slice('FILE_LOCKED_BY_CHECKLIST: '.length) },
        { status: 409 },
      );
    }
    throw e;
  }

  return new Response(null, { status: 204 });
}
