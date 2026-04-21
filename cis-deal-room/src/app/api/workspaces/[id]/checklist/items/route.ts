import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, createItem } from '@/lib/dal/checklist';

const schema = z.object({
  folderId: z.string().uuid(),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  owner: z.enum(['seller', 'buyer', 'both', 'cis_team', 'unassigned']).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return Response.json({ error: 'No checklist exists' }, { status: 404 });

  const row = await createItem({
    checklistId: checklist.id,
    workspaceId,
    ...parsed.data,
  });
  return Response.json(row, { status: 201 });
}
