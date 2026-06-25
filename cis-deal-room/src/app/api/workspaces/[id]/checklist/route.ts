import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, ensureChecklistForWorkspace, listItemsForViewer } from '@/lib/dal/checklist';
import { getPlaybookView, shouldShowCanonicalPlaybook } from '@/lib/dal/playbook';
import type { ParticipantRole, CisAdvisorySide } from '@/types';

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

  // Resolve the viewer's role and the workspace advisory side so we can decide
  // whether to serve the playbook overlay or the legacy items list.
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

  // Gate 1: does this workspace use the canonical playbook at all?
  // Buy-side workspaces never show the canonical 48-item overlay — the advisor
  // imports their own request list per engagement (v1.6 spec).
  const canonicalPlaybookForWorkspace = workspace
    ? shouldShowCanonicalPlaybook(workspace)
    : cisAdvisorySide === 'seller_side';

  // Gate 2: does this viewer's role entitle them to see the playbook overlay?
  // New roles: admin/cis_team see all; client/client_counsel see client side;
  // counterparty sees other side. view_only and deprecated counsel see nothing.
  const showPlaybook =
    canonicalPlaybookForWorkspace &&
    (session.isAdmin ||
      role === 'admin' ||
      role === 'cis_team' ||
      role === 'client' ||
      role === 'client_counsel' ||
      role === 'counterparty' ||
      // Deprecated roles — keep working until migrated
      role === 'seller_rep' ||
      role === 'seller_counsel' ||
      role === 'buyer_rep' ||
      role === 'buyer_counsel');

  let checklist = await getChecklistForWorkspace(workspaceId);

  // For playbook-eligible viewers, always ensure the checklist exists AND that
  // the 48 canonical rows are materialized. ensureChecklistForWorkspace is
  // idempotent: it creates the shell if missing and backfills any canonical
  // rows that don't exist yet (so rooms created before eager-materialization
  // get their rows on next load). On buy-side it's a no-op.
  if (showPlaybook) {
    checklist = await ensureChecklistForWorkspace(workspaceId, session.userId);
  }

  if (!checklist) {
    // Buyer-side / view_only viewers on workspaces with no imported checklist
    // see the empty legacy response.
    return Response.json({ checklist: null, items: [], playbook: null });
  }

  if (showPlaybook) {
    const playbook = await getPlaybookView(checklist.id);
    return Response.json({ checklist, playbook });
  }

  const items = await listItemsForViewer(workspaceId);
  return Response.json({ checklist, items });
}
