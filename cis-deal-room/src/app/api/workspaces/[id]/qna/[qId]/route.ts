import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getQuestionDetail } from '@/lib/dal/qna';

export async function GET(
  _request: Request,
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

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const question = await getQuestionDetail(workspaceId, qId, workspace.cisAdvisorySide, new Date());
  if (!question) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ question });
}
