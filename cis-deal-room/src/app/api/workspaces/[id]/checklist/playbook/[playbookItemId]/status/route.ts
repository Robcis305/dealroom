import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, setCanonicalItemStatus } from '@/lib/dal/checklist';

const bodySchema = z.object({
  target: z.enum([
    'not_started',
    'in_progress',
    'blocked',
    'received',
    'waived',
    'n_a',
    'reset',
  ]),
});

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; playbookItemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId, playbookItemId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return Response.json({ error: 'No checklist' }, { status: 404 });

  const itemId = await setCanonicalItemStatus({
    checklistId: checklist.id,
    playbookItemId,
    target: body.target,
  });

  return Response.json({ itemId, status: body.target });
}
