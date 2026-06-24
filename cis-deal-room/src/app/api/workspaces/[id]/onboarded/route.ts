import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { markOnboarded } from '@/lib/dal/participants';

/**
 * Marks the calling participant as having seen the first-run welcome for this
 * deal room. Idempotent — only mutates the caller's own active participant row.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  await markOnboarded(workspaceId, session);
  return Response.json({ ok: true });
}
