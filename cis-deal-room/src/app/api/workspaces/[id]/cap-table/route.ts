import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import {
  applyCapTableVisibilityGate,
  getCapTableForWorkspace,
  getCapTableRows,
} from '@/lib/dal/cap-table';
import type { ParticipantRole, ViewOnlyShadowSide } from '@/types';

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
  let shadowSide: ViewOnlyShadowSide | null = null;
  if (!session.isAdmin) {
    const [participant] = await db
      .select({
        role: workspaceParticipants.role,
        shadow: workspaceParticipants.viewOnlyShadowSide,
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
    shadowSide = participant.shadow;
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
      shadowSide,
      cisAdvisorySide: workspace.cisAdvisorySide,
    },
  );

  if (!gate.visible) {
    return Response.json({ capTable: { status: ct.status }, rows: [], hidden: true });
  }

  const rows = await getCapTableRows(ct.id);
  return Response.json({ capTable: ct, rows });
}
