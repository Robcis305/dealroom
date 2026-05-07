import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { publishCapTable, unpublishCapTable } from '@/lib/dal/cap-table';

const bodySchema = z.object({
  target: z.enum(['published', 'draft']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;

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

  try {
    const updated = body.target === 'published'
      ? await publishCapTable(workspaceId)
      : await unpublishCapTable(workspaceId);
    return Response.json({ capTable: updated });
  } catch (e) {
    if (e instanceof Error && e.message === 'Cap table not found') {
      return Response.json({ error: 'Cap table not found' }, { status: 404 });
    }
    throw e;
  }
}
