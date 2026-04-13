import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { updateParticipant, removeParticipant } from '@/lib/dal/participants';

const patchSchema = z.object({
  role: z.enum([
    'admin',
    'cis_team',
    'client',
    'counsel',
    'buyer_rep',
    'seller_rep',
    'view_only',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { pid } = await params;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    await updateParticipant(pid, { role: parsed.role, folderIds: parsed.folderIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    if (message === 'Participant not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { pid } = await params;

  try {
    await removeParticipant(pid);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    if (message === 'Participant not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 400 });
  }

  return new Response(null, { status: 204 });
}
