import { verifySession } from '@/lib/dal/index';
import { requireDealAccess, isCisTeamOrAdmin } from '@/lib/dal/access';
import { listWorkstreamsWithCounts, createWorkstreamByKey } from '@/lib/dal/workstreams';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workstreams = await listWorkstreamsWithCounts(workspaceId);
  return Response.json({ workstreams });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  const isCis = await isCisTeamOrAdmin(workspaceId, session);
  if (!isCis) return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.key !== 'string') return Response.json({ error: 'key required' }, { status: 400 });
  try {
    const workstream = await createWorkstreamByKey(workspaceId, body.key);
    return Response.json({ workstream }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && (e.message === 'Forbidden' || e.message === 'Unauthorized')) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (e instanceof Error && e.message === 'Invalid workstream key') return Response.json({ error: 'Invalid workstream key' }, { status: 400 });
    throw e;
  }
}
