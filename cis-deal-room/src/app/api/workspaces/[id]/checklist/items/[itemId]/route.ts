import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { updateItem, deleteItem } from '@/lib/dal/checklist';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  owner: z.enum(['seller', 'buyer', 'both', 'cis_team', 'unassigned']).optional(),
  folderId: z.string().uuid().optional(),
  notes: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId, itemId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const result = await updateItem(itemId, parsed.data);

  // TODO(Task 28): When owner transitions from unassigned → a concrete side,
  // call enqueueChecklistAssignedNotifications({ workspaceId, itemId,
  //   itemName: result.updated.name, newOwner: result.newlyAssignedOwner })
  // The helper is built in Task 28 and doesn't exist yet.

  return Response.json(result.updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId, itemId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deleteItem(itemId);
  return new Response(null, { status: 204 });
}
