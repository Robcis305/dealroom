import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { postMessage } from '@/lib/dal/qna';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; qId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId, qId } = await params;

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

  if (!body.body || typeof body.body !== 'string' || !body.body.trim()) {
    return Response.json({ error: 'body is required' }, { status: 400 });
  }

  const result = await postMessage(workspaceId, qId, body.body);
  return Response.json({ id: result.id }, { status: 201 });
}
