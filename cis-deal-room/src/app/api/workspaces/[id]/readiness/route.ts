import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants, checklistItems } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import {
  ensureChecklistForWorkspace,
  getChecklistForWorkspace,
  ownerFilterForSession,
} from '@/lib/dal/checklist';
import { getReadinessSummary, shouldShowCanonicalPlaybook, STAGE_META } from '@/lib/dal/playbook';
import type { ParticipantRole } from '@/types';

// Roles that may view the canonical sell-side playbook readiness summary.
const PLAYBOOK_VISIBLE_ROLES = new Set<ParticipantRole>([
  'admin',
  'cis_team',
  'client',
  'client_counsel',
  'counterparty',
  // Deprecated — keep working until migrated
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

  // Workspace lookup
  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  // Resolve viewer role (mirrors listItemsForViewer pattern)
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

  if (!shouldShowCanonicalPlaybook(workspace)) {
    // Buy-side: simple counter from custom checklist items
    const checklist = await getChecklistForWorkspace(workspaceId);
    if (!checklist) {
      return Response.json({ mode: 'simple', total: 0, ready: 0 });
    }

    const ownerFilter = ownerFilterForSession({
      isAdmin: session.isAdmin,
      role,
      cisAdvisorySide: workspace.cisAdvisorySide,
    });
    if (ownerFilter !== null && ownerFilter.length === 0) {
      return Response.json({ mode: 'simple', total: 0, ready: 0 });
    }

    const baseWhere = ownerFilter === null
      ? eq(checklistItems.checklistId, checklist.id)
      : and(eq(checklistItems.checklistId, checklist.id), inArray(checklistItems.owner, ownerFilter));

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(checklistItems)
      .where(baseWhere);

    const [{ value: ready }] = await db
      .select({ value: count() })
      .from(checklistItems)
      .where(and(baseWhere, inArray(checklistItems.status, ['received', 'waived', 'n_a'])));

    return Response.json({
      mode: 'simple',
      total: Number(total),
      ready: Number(ready),
    });
  }

  // Sell-side: canonical v1.4 readiness summary
  const allowed = session.isAdmin || PLAYBOOK_VISIBLE_ROLES.has(role);
  if (!allowed) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await ensureChecklistForWorkspace(workspaceId, session.userId);

  if (!checklist) {
    return Response.json({
      mode: 'canonical',
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
      byStage: {
        1: { total: 0, ready: 0, label: STAGE_META[1].label, dayRange: STAGE_META[1].dayRange },
        2: { total: 0, ready: 0, label: STAGE_META[2].label, dayRange: STAGE_META[2].dayRange },
        3: { total: 0, ready: 0, label: STAGE_META[3].label, dayRange: STAGE_META[3].dayRange },
        4: { total: 0, ready: 0, label: STAGE_META[4].label, dayRange: STAGE_META[4].dayRange },
      },
      dealKillerGroups: [],
    });
  }

  const summary = await getReadinessSummary(checklist.id);
  return Response.json({ mode: 'canonical', ...summary });
}
