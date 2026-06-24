import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { listWorkstreamMembers, addWorkstreamMember, removeWorkstreamMember } from '@/lib/dal/workstreams';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, wsId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  return Response.json({ members: await listWorkstreamMembers(wsId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, wsId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let postBody: Record<string, unknown>;
  try { postBody = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { participantId } = postBody;
  if (!participantId) return Response.json({ error: 'participantId required' }, { status: 400 });
  try {
    await addWorkstreamMember(workspaceId, wsId, participantId as string);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'Forbidden' || e.message === 'Unauthorized')
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (e.message === 'ParticipantNotActive')
        return Response.json({ error: "This person hasn't accepted their invite yet — they need to sign in before they can join a workstream." }, { status: 409 });
      if (e.message === 'ParticipantViewOnly')
        return Response.json({ error: 'View-only participants cannot be added to a workstream.' }, { status: 409 });
      if (e.message === 'ParticipantNotFound')
        return Response.json({ error: 'Participant not found.' }, { status: 404 });
    }
    throw e;
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId, wsId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let deleteBody: Record<string, unknown>;
  try { deleteBody = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { participantId } = deleteBody;
  if (!participantId) return Response.json({ error: 'participantId required' }, { status: 400 });
  try {
    await removeWorkstreamMember(workspaceId, wsId, participantId as string);
  } catch (e) {
    if (e instanceof Error && (e.message === 'Forbidden' || e.message === 'Unauthorized'))
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    throw e;
  }
  return Response.json({ ok: true });
}
