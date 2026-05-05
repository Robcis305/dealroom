import { verifySession } from '@/lib/dal/index';
import { restoreFile } from '@/lib/dal/files';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: fileId } = await params;

  try {
    const result = await restoreFile(fileId);
    return Response.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'File not found') {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }
    throw e;
  }
}
