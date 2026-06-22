import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { listWorkstreamsWithCounts } from '@/lib/dal/workstreams';

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
