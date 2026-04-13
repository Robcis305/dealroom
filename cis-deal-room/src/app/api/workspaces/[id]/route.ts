import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getWorkspace } from '@/lib/dal/workspaces';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Next.js 15: params is a Promise
  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const workspace = await getWorkspace(workspaceId);

    if (!workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return Response.json(workspace);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
