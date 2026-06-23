import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { listQuestions, createQuestion } from '@/lib/dal/qna';
import { enqueueQnaAssignedNotification } from '@/lib/notifications/enqueue-qna-notifications';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const questions = await listQuestions(workspaceId, new Date());
  return Response.json({ questions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

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

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const assigneeId = typeof body.assigneeId === 'string' ? body.assigneeId : null;

  const result = await createQuestion({
    workspaceId,
    title: body.title.trim(),
    workstreamIds: Array.isArray(body.workstreamIds) ? (body.workstreamIds as string[]) : [],
    assigneeId,
    requestedBy: typeof body.requestedBy === 'string' ? body.requestedBy : null,
    visibility: body.visibility === 'private' ? 'private' : 'public',
    recipientParticipantIds: Array.isArray(body.recipientParticipantIds)
      ? (body.recipientParticipantIds as string[])
      : [],
    linkedDocId: typeof body.linkedDocId === 'string' ? body.linkedDocId : null,
  });

  if (assigneeId) {
    try {
      await enqueueQnaAssignedNotification({ workspaceId, questionId: result.id, assigneeUserId: assigneeId });
    } catch (e) { console.error('[qna] assigned notification failed', e); }
  }

  return Response.json({ id: result.id }, { status: 201 });
}
