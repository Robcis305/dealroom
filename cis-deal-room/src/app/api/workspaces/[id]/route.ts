import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getWorkspace, deleteWorkspace, updateWorkspaceName } from '@/lib/dal/workspaces';

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  if (typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Name required' }, { status: 400 });
  }

  try {
    const updated = await updateWorkspaceName(workspaceId, name);
    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Admin required' || error.message === 'Unauthorized') {
        return Response.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'Name required') {
        return Response.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'Workspace not found') {
        return Response.json({ error: error.message }, { status: 404 });
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;

  try {
    await deleteWorkspace(workspaceId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Admin required' || error.message === 'Unauthorized') {
        return Response.json({ error: error.message }, { status: 403 });
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
