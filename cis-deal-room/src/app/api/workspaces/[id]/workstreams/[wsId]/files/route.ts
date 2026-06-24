import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getFilesForWorkstream } from '@/lib/dal/files';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; wsId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId, wsId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const files = await getFilesForWorkstream(workspaceId, wsId);
    return Response.json({ files });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
