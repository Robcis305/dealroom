import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { getFileById, getFileVersions } from '@/lib/dal/files';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await params;
  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const versions = await getFileVersions(fileId);
  return Response.json(versions);
}
