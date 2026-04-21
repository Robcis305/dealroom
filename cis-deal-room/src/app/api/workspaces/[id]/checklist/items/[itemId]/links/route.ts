import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { linkFileToItem, unlinkFileFromItem } from '@/lib/dal/checklist';

const schema = z.object({ fileId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, itemId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const result = await linkFileToItem(itemId, parsed.data.fileId);
  return Response.json(result);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, itemId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  await unlinkFileFromItem(itemId, parsed.data.fileId);
  return new Response(null, { status: 204 });
}
