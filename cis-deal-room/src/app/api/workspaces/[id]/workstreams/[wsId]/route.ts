import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getWorkstream, listWorkstreamMembers, updateWorkstream, getWorkstreamActivity } from '@/lib/dal/workstreams';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, wsId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workstream = await getWorkstream(workspaceId, wsId);
  if (!workstream) return Response.json({ error: 'Not found' }, { status: 404 });
  const [members, recentActivity] = await Promise.all([
    listWorkstreamMembers(wsId),
    getWorkstreamActivity(workspaceId, wsId),
  ]);
  return Response.json({ workstream, members, recentActivity });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId, wsId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const patch: { name?: string; description?: string | null } = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description;
  try {
    const workstream = await updateWorkstream(workspaceId, wsId, patch);
    return Response.json({ workstream });
  } catch (e) {
    if (e instanceof Error && e.message === 'Workstream not found') return Response.json({ error: 'Not found' }, { status: 404 });
    throw e;
  }
}
