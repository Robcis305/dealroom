import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { submitProposedAnswer } from '@/lib/dal/qna';
import { enqueueQnaAnswerSubmittedNotification, enqueueQnaApprovedNotification } from '@/lib/notifications/enqueue-qna-notifications';

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

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const cisAdvisorySide = workspace.cisAdvisorySide;

  await submitProposedAnswer({
    workspaceId,
    questionId: qId,
    body: body.body,
    attachmentFileIds: Array.isArray(body.attachmentFileIds)
      ? (body.attachmentFileIds as string[])
      : [],
    cisAdvisorySide,
  });

  try {
    if (cisAdvisorySide === 'seller_side') {
      await enqueueQnaAnswerSubmittedNotification({ workspaceId, questionId: qId });
    } else {
      await enqueueQnaApprovedNotification({ workspaceId, questionId: qId }); // buy-side auto-released
    }
  } catch (e) { console.error('[qna] answer notification failed', e); }

  return Response.json({ ok: true });
}
