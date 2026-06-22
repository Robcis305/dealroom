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
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId, wsId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let postBody: Record<string, unknown>;
  try { postBody = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { participantId } = postBody;
  if (!participantId) return Response.json({ error: 'participantId required' }, { status: 400 });
  await addWorkstreamMember(workspaceId, wsId, participantId as string);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; wsId: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId, wsId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let deleteBody: Record<string, unknown>;
  try { deleteBody = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { participantId } = deleteBody;
  if (!participantId) return Response.json({ error: 'participantId required' }, { status: 400 });
  await removeWorkstreamMember(workspaceId, wsId, participantId as string);
  return Response.json({ ok: true });
}
