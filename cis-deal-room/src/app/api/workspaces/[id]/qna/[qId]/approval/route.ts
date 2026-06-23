import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { applyApprovalAction } from '@/lib/dal/qna';
import { enqueueQnaApprovedNotification, enqueueQnaAssignedNotification } from '@/lib/notifications/enqueue-qna-notifications';

const VALID_ACTIONS = new Set(['approve', 'request_changes', 'reroute']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; qId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

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

  if (!body.action || typeof body.action !== 'string' || !VALID_ACTIONS.has(body.action)) {
    return Response.json(
      { error: 'action must be one of: approve, request_changes, reroute' },
      { status: 400 },
    );
  }

  const action = body.action as 'approve' | 'request_changes' | 'reroute';
  const newAssigneeId = typeof body.newAssigneeId === 'string' ? body.newAssigneeId : null;

  await applyApprovalAction({
    workspaceId,
    questionId: qId,
    action,
    newAssigneeId,
  });

  try {
    if (action === 'approve') {
      await enqueueQnaApprovedNotification({ workspaceId, questionId: qId });
    } else if (action === 'reroute' && newAssigneeId) {
      await enqueueQnaAssignedNotification({ workspaceId, questionId: qId, assigneeUserId: newAssigneeId });
    }
  } catch (e) { console.error('[qna] approval notification failed', e); }

  return Response.json({ ok: true });
}
