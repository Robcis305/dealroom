import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, users, workspaces } from '@/db/schema';
import { enqueueOrSend } from './enqueue-or-send';
import type { ChecklistOwner } from '@/types';
import { ownerFilterForSession } from '@/lib/dal/checklist';
import { ChecklistAssignedEmail } from '@/lib/email/checklist-assigned';

/**
 * Called when an item's owner transitions from 'unassigned' → a concrete side.
 * Resolves which workspace participants see the new owner (per role filter)
 * and enqueues one notification per participant.
 */
export async function enqueueChecklistAssignedNotifications(input: {
  workspaceId: string;
  itemId: string;
  itemName: string;
  newOwner: Exclude<ChecklistOwner, 'unassigned'>;
}): Promise<void> {
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!workspace) return;

  const participants = await db
    .select({
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
      shadow: workspaceParticipants.viewOnlyShadowSide,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(
      and(
        eq(workspaceParticipants.workspaceId, input.workspaceId),
        eq(workspaceParticipants.status, 'active'),
      ),
    );

  const recipients = participants.filter((p) => {
    const filter = ownerFilterForSession({
      isAdmin: false,
      role: p.role,
      shadowSide: p.shadow,
      cisAdvisorySide: workspace.cisAdvisorySide,
    });
    return filter !== null && filter.includes(input.newOwner);
  });

  await Promise.all(
    recipients.map((r) =>
      enqueueOrSend({
        userId: r.userId,
        workspaceId: input.workspaceId,
        action: 'checklist_item_assigned',
        targetType: 'file',
        targetId: input.itemId,
        metadata: { itemName: input.itemName, owner: input.newOwner },
        channel: 'uploads',
        immediateEmail: async () => ({
          to: r.email,
          subject: `New diligence item assigned: ${input.itemName}`,
          react: ChecklistAssignedEmail({
            workspaceName: workspace.name,
            itemName: input.itemName,
            workspaceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/workspace/${workspace.id}`,
          }),
        }),
      }),
    ),
  );
}
