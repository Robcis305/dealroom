import { desc, eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants, folders, files, activityLogs } from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import type { WorkspaceStatus, CisAdvisorySide } from '@/types';

/** Ordered list of default folders created with every new workspace. */
const DEFAULT_FOLDERS = [
  'Financials',
  'Legal',
  'Operations',
  'Human Capital',
  'Tax',
  'Technology',
  'Deal Documents',
  'Miscellaneous',
] as const;

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns workspaces visible to the current session user.
 * Admin → all workspaces ordered by creation date.
 * Non-admin → only workspaces the user is an active participant in.
 */
export async function getWorkspacesForUser() {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const baseSelect = {
    id: workspaces.id,
    name: workspaces.name,
    clientName: workspaces.clientName,
    status: workspaces.status,
    cisAdvisorySide: workspaces.cisAdvisorySide,
    createdAt: workspaces.createdAt,
    updatedAt: workspaces.updatedAt,
    docCount: sql<number>`(
      select count(*)::int from ${files}
      inner join ${folders} on ${folders.id} = ${files.folderId}
      where ${folders.workspaceId} = ${workspaces.id}
    )`,
    participantCount: sql<number>`(
      select count(*)::int from ${workspaceParticipants}
      where ${workspaceParticipants.workspaceId} = ${workspaces.id}
        and ${workspaceParticipants.status} = 'active'
    )`,
    lastActivityAction: sql<string | null>`(
      select action from ${activityLogs}
      where ${activityLogs.workspaceId} = ${workspaces.id}
      order by ${activityLogs.createdAt} desc limit 1
    )`,
    lastActivityAt: sql<Date | null>`(
      select ${activityLogs.createdAt} from ${activityLogs}
      where ${activityLogs.workspaceId} = ${workspaces.id}
      order by ${activityLogs.createdAt} desc limit 1
    )`,
  };

  if (session.isAdmin) {
    return db.select(baseSelect).from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  return db
    .select(baseSelect)
    .from(workspaces)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .orderBy(desc(workspaces.createdAt));
}

/**
 * Returns a single workspace by ID. Does not check access — callers
 * that need IDOR protection should call requireDealAccess() first.
 */
export async function getWorkspace(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace ?? null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Creates a new workspace and 8 default folders in a single transaction.
 * Logs a 'created_workspace' activity row inside the same transaction.
 * Admin-only.
 */
export async function createWorkspace(input: {
  name: string;
  clientName: string;
  cisAdvisorySide: CisAdvisorySide;
  status: WorkspaceStatus;
}) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const createdWorkspace = await db.transaction(async (tx) => {
    // 1. Insert workspace
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name: input.name,
        clientName: input.clientName,
        cisAdvisorySide: input.cisAdvisorySide,
        status: input.status,
        createdBy: session.userId,
      })
      .returning();

    // 2. Insert 8 default folders
    await tx.insert(folders).values(
      DEFAULT_FOLDERS.map((name, index) => ({
        workspaceId: workspace.id,
        name,
        sortOrder: index,
      }))
    );

    // 3. Log activity inside the same transaction
    await logActivity(tx, {
      workspaceId: workspace.id,
      userId: session.userId,
      action: 'created_workspace',
      targetType: 'workspace',
      targetId: workspace.id,
    });

    return workspace;
  });

  return createdWorkspace;
}

/**
 * Updates the status of a workspace and logs the change.
 * Admin-only.
 */
export async function updateWorkspaceStatus(
  workspaceId: string,
  status: WorkspaceStatus
) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [updated] = await db
    .update(workspaces)
    .set({ status, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();

  await logActivity(db, {
    workspaceId,
    userId: session.userId,
    action: 'status_changed',
    targetType: 'workspace',
    targetId: workspaceId,
    metadata: { newStatus: status },
  });

  return updated;
}
