import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { getFileById, getFileVersions } from '@/lib/dal/files';
import { assertFileInWorkspace } from '@/lib/dal/assertions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId, fileId } = await params;

  try {
    await assertFileInWorkspace(fileId, workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Forbidden';
    return Response.json(
      { error: msg },
      { status: msg === 'Not found' ? 404 : 403 }
    );
  }

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
