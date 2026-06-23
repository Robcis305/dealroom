import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import {
  applyCapTableVisibilityGate,
  getCapTableForWorkspace,
  getCapTableRows,
  deleteCapTable,
} from '@/lib/dal/cap-table';
import type { ParticipantRole } from '@/types';

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

  const ct = await getCapTableForWorkspace(workspaceId);
  if (!ct) {
    return Response.json({ capTable: null, rows: [] });
  }

  // Resolve viewer scope (mirror of listItemsForViewer pattern).
  let role: ParticipantRole = 'admin';
  if (!session.isAdmin) {
    const [participant] = await db
      .select({
        role: workspaceParticipants.role,
      })
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, workspaceId),
          eq(workspaceParticipants.userId, session.userId),
          eq(workspaceParticipants.status, 'active'),
        ),
      )
      .limit(1);
    if (!participant) return Response.json({ error: 'Forbidden' }, { status: 403 });
    role = participant.role;
  }

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const gate = applyCapTableVisibilityGate(
    { id: ct.id, status: ct.status },
    {
      isAdmin: session.isAdmin,
      role,
      cisAdvisorySide: workspace.cisAdvisorySide,
    },
  );

  if (!gate.visible) {
    return Response.json({ capTable: { status: ct.status }, rows: [], hidden: true });
  }

  const rows = await getCapTableRows(ct.id);
  return Response.json({ capTable: ct, rows });
}

export async function DELETE(
  _request: Request,
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

  try {
    const result = await deleteCapTable(workspaceId);
    return Response.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Cap table not found') {
      return Response.json({ error: 'Cap table not found' }, { status: 404 });
    }
    throw e;
  }
}
