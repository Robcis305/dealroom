import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db';
import {
  workstreams,
  workstreamMembers,
  fileWorkstreams,
  files,
  workspaceParticipants,
  users,
} from '@/db/schema';
import { CANONICAL_WORKSTREAMS } from '@/lib/workstreams/constants';
import { verifySession } from './index';
import { logActivity } from './activity';
import type { Workstream, WorkstreamWithCounts } from '@/types';

/** Idempotently seed the 5 canonical workstreams for a workspace. */
export async function ensureWorkstreams(workspaceId: string): Promise<void> {
  await db
    .insert(workstreams)
    .values(
      CANONICAL_WORKSTREAMS.map((w) => ({
        workspaceId,
        key: w.key,
        name: w.name,
        color: w.color,
        tileTint: w.tileTint,
        description: w.description,
        sortOrder: w.sortOrder,
      })),
    )
    .onConflictDoNothing();
}

/** Seed (if needed) then return the workspace's workstreams with derived counts. */
export async function listWorkstreamsWithCounts(workspaceId: string): Promise<WorkstreamWithCounts[]> {
  await ensureWorkstreams(workspaceId);

  const rows = await db
    .select()
    .from(workstreams)
    .where(eq(workstreams.workspaceId, workspaceId))
    .orderBy(workstreams.sortOrder);

  // doc counts: file_workstreams joined to non-deleted files
  const docCounts = await db
    .select({
      workstreamId: fileWorkstreams.workstreamId,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(fileWorkstreams)
    .innerJoin(files, eq(files.id, fileWorkstreams.fileId))
    .where(drizzleSql`${files.deletedAt} is null`)
    .groupBy(fileWorkstreams.workstreamId);

  const memberCounts = await db
    .select({
      workstreamId: workstreamMembers.workstreamId,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(workstreamMembers)
    .innerJoin(
      workspaceParticipants,
      eq(workspaceParticipants.id, workstreamMembers.participantId),
    )
    .where(eq(workspaceParticipants.status, 'active'))
    .groupBy(workstreamMembers.workstreamId);

  const docMap = new Map(docCounts.map((d) => [d.workstreamId, Number(d.count)]));
  const memberMap = new Map(memberCounts.map((m) => [m.workstreamId, Number(m.count)]));

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    key: r.key,
    name: r.name,
    color: r.color,
    tileTint: r.tileTint,
    description: r.description,
    sortOrder: r.sortOrder,
    docCount: docMap.get(r.id) ?? 0,
    memberCount: memberMap.get(r.id) ?? 0,
    openQaCount: 0,  // PR2
    overdueCount: 0, // PR2
  }));
}

export async function getWorkstream(workspaceId: string, workstreamId: string): Promise<Workstream | null> {
  const [row] = await db
    .select()
    .from(workstreams)
    .where(and(eq(workstreams.id, workstreamId), eq(workstreams.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function listWorkstreamMembers(workstreamId: string) {
  return db
    .select({
      participantId: workstreamMembers.participantId,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: workspaceParticipants.role,
    })
    .from(workstreamMembers)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, workstreamMembers.participantId))
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workstreamMembers.workstreamId, workstreamId));
}

export async function addWorkstreamMember(workspaceId: string, workstreamId: string, participantId: string): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.transaction(async (tx) => {
    await tx.insert(workstreamMembers).values({ workstreamId, participantId, addedBy: session.userId }).onConflictDoNothing();
    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'workstream_member_added',
      targetType: 'workstream',
      targetId: workstreamId,
      metadata: { participantId },
    });
  });
}

export async function removeWorkstreamMember(workspaceId: string, workstreamId: string, participantId: string): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.transaction(async (tx) => {
    await tx
      .delete(workstreamMembers)
      .where(and(eq(workstreamMembers.workstreamId, workstreamId), eq(workstreamMembers.participantId, participantId)));
    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'workstream_member_removed',
      targetType: 'workstream',
      targetId: workstreamId,
      metadata: { participantId },
    });
  });
}

export async function updateWorkstream(
  workspaceId: string,
  workstreamId: string,
  patch: { name?: string; description?: string | null },
): Promise<Workstream> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(workstreams)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(workstreams.id, workstreamId), eq(workstreams.workspaceId, workspaceId)))
      .returning();
    if (!row) throw new Error('Workstream not found');
    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'workstream_updated',
      targetType: 'workstream',
      targetId: workstreamId,
      metadata: { patch },
    });
    return row;
  });
}
