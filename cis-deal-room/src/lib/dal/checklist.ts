import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  checklists,
  checklistItems,
  checklistItemFiles,
  workspaces,
  workspaceParticipants,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import type { CisAdvisorySide, ChecklistOwner, ChecklistPriority, ChecklistStatus, ParticipantRole, ViewOnlyShadowSide } from '@/types';

interface SessionScope {
  isAdmin: boolean;
  role: ParticipantRole;
  shadowSide: ViewOnlyShadowSide | null;
  cisAdvisorySide: CisAdvisorySide;
}

/**
 * Returns the set of `owner` values this viewer is allowed to see, or `null`
 * for unrestricted (admin/cis_team — sees all rows, including unassigned).
 * Returns `[]` for roles with no visibility (deprecated counsel role).
 */
export function ownerFilterForSession(scope: SessionScope): ChecklistOwner[] | null {
  if (scope.isAdmin || scope.role === 'cis_team' || scope.role === 'admin') {
    return null;
  }

  if (scope.role === 'client') {
    return scope.cisAdvisorySide === 'buyer_side' ? ['buyer', 'both'] : ['seller', 'both'];
  }

  if (scope.role === 'seller_rep' || scope.role === 'seller_counsel') {
    return ['seller', 'both'];
  }
  if (scope.role === 'buyer_rep' || scope.role === 'buyer_counsel') {
    return ['buyer', 'both'];
  }

  if (scope.role === 'view_only') {
    if (scope.shadowSide === 'seller') return ['seller', 'both'];
    if (scope.shadowSide === 'buyer') return ['buyer', 'both'];
    return [];
  }

  // 'counsel' (deprecated) and any unknown role: no visibility until reassigned.
  return [];
}

/** Returns the single checklist row for a workspace, or null. */
export async function getChecklistForWorkspace(workspaceId: string) {
  const [row] = await db
    .select()
    .from(checklists)
    .where(eq(checklists.workspaceId, workspaceId))
    .orderBy(desc(checklists.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Returns all checklist items for the viewer's workspace, filtered by their
 * owner-visibility scope. Admin/cis_team see all (including unassigned).
 */
export async function listItemsForViewer(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error('Workspace not found');

  // Derive the viewer's role/shadow side (admin bypasses, no participant row needed)
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
    if (!participant) throw new Error('Unauthorized');
    role = participant.role;
    shadowSide = participant.shadow;
  }

  const filter = ownerFilterForSession({
    isAdmin: session.isAdmin,
    role,
    shadowSide,
    cisAdvisorySide: workspace.cisAdvisorySide,
  });

  // Empty filter = viewer sees nothing (short-circuit)
  if (filter !== null && filter.length === 0) return [];

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return [];

  const items = await db
    .select({
      id: checklistItems.id,
      sortOrder: checklistItems.sortOrder,
      category: checklistItems.category,
      folderId: checklistItems.folderId,
      name: checklistItems.name,
      description: checklistItems.description,
      priority: checklistItems.priority,
      owner: checklistItems.owner,
      status: checklistItems.status,
      notes: checklistItems.notes,
      requestedAt: checklistItems.requestedAt,
      receivedAt: checklistItems.receivedAt,
    })
    .from(checklistItems)
    .where(
      filter === null
        ? eq(checklistItems.checklistId, checklist.id)
        : and(
            eq(checklistItems.checklistId, checklist.id),
            inArray(checklistItems.owner, filter),
          ),
    )
    .orderBy(checklistItems.sortOrder, checklistItems.category, checklistItems.name);

  return items;
}

/**
 * Creates the workspace's checklist shell. Admin-only. Logs 'checklist_imported'.
 * Returns the new checklist row.
 */
export async function createChecklist(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(checklists)
      .values({ workspaceId, createdBy: session.userId })
      .returning();

    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'checklist_imported',
      targetType: 'workspace',
      targetId: workspaceId,
    });

    return row;
  });

  return created;
}

interface CreateItemInput {
  checklistId: string;
  workspaceId: string;
  folderId: string;
  category: string;
  name: string;
  description?: string | null;
  priority?: ChecklistPriority;
  owner?: ChecklistOwner;
  notes?: string | null;
  sortOrder?: number;
}

export async function createItem(input: CreateItemInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [row] = await db
    .insert(checklistItems)
    .values({
      checklistId: input.checklistId,
      folderId: input.folderId,
      category: input.category,
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 'medium',
      owner: input.owner ?? 'unassigned',
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return row;
}

interface UpdateItemInput {
  name?: string;
  description?: string | null;
  priority?: ChecklistPriority;
  owner?: ChecklistOwner;
  folderId?: string;
  notes?: string | null;
  category?: string;
}

/**
 * Patch an item. Admin-only. Owner transitions from 'unassigned' → a concrete
 * side return a `newlyAssignedOwner` value so the caller can enqueue notifications.
 */
export async function updateItem(itemId: string, input: UpdateItemInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: checklistItems.id,
      owner: checklistItems.owner,
      checklistId: checklistItems.checklistId,
    })
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  if (!existing) throw new Error('Item not found');

  const [updated] = await db
    .update(checklistItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId))
    .returning();

  // Owner assignment signal (for notification)
  let newlyAssignedOwner: ChecklistOwner | null = null;
  if (
    input.owner !== undefined &&
    existing.owner === 'unassigned' &&
    input.owner !== 'unassigned'
  ) {
    newlyAssignedOwner = input.owner;
  }

  return { updated, newlyAssignedOwner };
}

export async function deleteItem(itemId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
}

/**
 * Admin-only. Applies the explicit state transition. Terminal states
 * (received/waived/n_a) are set with current timestamp + actor when
 * applicable. 'reset' recomputes from link count (0 → not_started, ≥1 → in_progress).
 */
export async function setItemStatus(
  itemId: string,
  target: ChecklistStatus | 'reset',
): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: checklistItems.id,
        checklistId: checklistItems.checklistId,
        workspaceId: checklists.workspaceId,
        status: checklistItems.status,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(eq(checklistItems.id, itemId))
      .limit(1);
    if (!item) throw new Error('Item not found');

    let nextStatus: ChecklistStatus;
    if (target === 'reset') {
      const [{ count: linkCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(checklistItemFiles)
        .where(eq(checklistItemFiles.itemId, itemId));
      nextStatus = linkCount > 0 ? 'in_progress' : 'not_started';
    } else {
      nextStatus = target;
    }

    const patch: Partial<typeof checklistItems.$inferInsert> = {
      status: nextStatus,
      updatedAt: new Date(),
    };
    if (nextStatus === 'received') {
      patch.receivedAt = new Date();
      patch.receivedBy = session.userId;
    } else {
      patch.receivedAt = null;
      patch.receivedBy = null;
    }

    await tx.update(checklistItems).set(patch).where(eq(checklistItems.id, itemId));

    // Activity
    const actionMap: Record<ChecklistStatus, import('@/types').ActivityAction | null> = {
      received: 'checklist_item_received',
      waived: 'checklist_item_waived',
      n_a: 'checklist_item_na',
      not_started: null,
      in_progress: null,
    };
    const action = actionMap[nextStatus];
    if (action) {
      await logActivity(tx, {
        workspaceId: item.workspaceId,
        userId: session.userId,
        action,
        targetType: 'file',
        targetId: itemId,
      });
    }
  });
}

/**
 * Links a file to a checklist item. If the item status is 'not_started' and
 * status is not already a terminal admin-set state, transitions to 'in_progress'.
 * Returns the link row + whether a status transition was made.
 */
export async function linkFileToItem(itemId: string, fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: checklistItems.id,
        checklistId: checklistItems.checklistId,
        workspaceId: checklists.workspaceId,
        status: checklistItems.status,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(eq(checklistItems.id, itemId))
      .limit(1);
    if (!item) throw new Error('Item not found');

    // Upsert link (idempotent)
    await tx
      .insert(checklistItemFiles)
      .values({ itemId, fileId, linkedBy: session.userId })
      .onConflictDoNothing();

    let transitioned = false;
    if (item.status === 'not_started') {
      await tx
        .update(checklistItems)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(checklistItems.id, itemId));
      transitioned = true;
    }

    await logActivity(tx, {
      workspaceId: item.workspaceId,
      userId: session.userId,
      action: 'checklist_item_linked',
      targetType: 'file',
      targetId: fileId,
      metadata: { itemId },
    });

    return { transitioned };
  });
}

/**
 * Unlinks a file from a checklist item. If 0 links remain and status is
 * 'in_progress', reverts to 'not_started'. Terminal admin-set states
 * (received/waived/n_a) are untouched.
 */
export async function unlinkFileFromItem(itemId: string, fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    await tx
      .delete(checklistItemFiles)
      .where(
        and(
          eq(checklistItemFiles.itemId, itemId),
          eq(checklistItemFiles.fileId, fileId),
        ),
      );

    const [{ count: linkCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(checklistItemFiles)
      .where(eq(checklistItemFiles.itemId, itemId));

    if (linkCount === 0) {
      const [item] = await tx
        .select({ status: checklistItems.status })
        .from(checklistItems)
        .where(eq(checklistItems.id, itemId))
        .limit(1);
      if (item?.status === 'in_progress') {
        await tx
          .update(checklistItems)
          .set({ status: 'not_started', updatedAt: new Date() })
          .where(eq(checklistItems.id, itemId));
      }
    }
  });
}
