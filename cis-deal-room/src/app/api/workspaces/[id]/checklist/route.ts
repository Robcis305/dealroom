import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, listItemsForViewer } from '@/lib/dal/checklist';
import { getPlaybookView } from '@/lib/dal/playbook';
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

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) {
    return Response.json({ checklist: null, items: [], playbook: null });
  }

  // Decide whether this viewer sees the playbook overlay.
  // Hide playbook from buyer-side, view_only, and the deprecated counsel role.
  const isClientOnSellerSide = role === 'client' && cisAdvisorySide === 'seller_side';
  const showPlaybook =
    session.isAdmin ||
    role === 'admin' ||
    role === 'cis_team' ||
    role === 'seller_rep' ||
    role === 'seller_counsel' ||
    isClientOnSellerSide;

  if (showPlaybook) {
    const playbook = await getPlaybookView(checklist.id);
    return Response.json({ checklist, playbook });
  }

  const items = await listItemsForViewer(workspaceId);
  return Response.json({ checklist, items });
}
