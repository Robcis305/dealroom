import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace } from '@/lib/dal/checklist';
import { getReadinessSummary } from '@/lib/dal/playbook';
import type { ParticipantRole, CisAdvisorySide } from '@/types';

const PLAYBOOK_VISIBLE_ROLES = new Set<ParticipantRole>([
  'admin',
  'cis_team',
  'seller_rep',
  'seller_counsel',
]);

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

  // Resolve role and cisAdvisorySide for gating
  let role: ParticipantRole = 'admin';
  let cisAdvisorySide: CisAdvisorySide = 'seller_side';

  if (!session.isAdmin) {
    const [participant] = await db
      .select({ role: workspaceParticipants.role })
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
  if (workspace) cisAdvisorySide = workspace.cisAdvisorySide;

  const isClientOnSellerSide = role === 'client' && cisAdvisorySide === 'seller_side';
  const allowed =
    session.isAdmin || PLAYBOOK_VISIBLE_ROLES.has(role) || isClientOnSellerSide;
  if (!allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) {
    return Response.json({
      total: 0,
      ready: 0,
      byCategory: {
        corporate_legal: { total: 0, ready: 0 },
        financial: { total: 0, ready: 0 },
        commercial: { total: 0, ready: 0 },
        team_hr: { total: 0, ready: 0 },
        ip_technical: { total: 0, ready: 0 },
        operations_risk: { total: 0, ready: 0 },
      },
      dealKillerGroups: [],
    });
  }

  const summary = await getReadinessSummary(checklist.id);
  return Response.json(summary);
}
