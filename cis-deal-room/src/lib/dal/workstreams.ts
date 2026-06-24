import { and, desc, eq, inArray, or, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db';
import {
  workstreams,
  workstreamMembers,
  fileWorkstreams,
  files,
  workspaceParticipants,
  users,
  activityLogs,
  qnaQuestions,
  qnaQuestionWorkstreams,
} from '@/db/schema';
import { CANONICAL_WORKSTREAMS } from '@/lib/workstreams/constants';
import { verifySession } from './index';
import { logActivity } from './activity';
import { isCisTeamOrAdmin } from './access';
import type { ActivityAction, Workstream, WorkstreamWithCounts } from '@/types';

export async function createWorkstreamByKey(workspaceId: string, key: string): Promise<Workstream> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');
  const def = CANONICAL_WORKSTREAMS.find((w) => w.key === key);
  if (!def) throw new Error('Invalid workstream key');
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(workstreams).values({
      workspaceId, key: def.key, name: def.name, color: def.color,
      tileTint: def.tileTint, description: def.description, sortOrder: def.sortOrder,
    }).onConflictDoNothing().returning();
    if (created) {
      await logActivity(tx, { workspaceId, userId: session.userId, action: 'workstream_updated',
        targetType: 'workstream', targetId: created.id, metadata: { created: true, key: def.key } });
      return created;
    }
    const [existing] = await tx.select().from(workstreams)
      .where(and(eq(workstreams.workspaceId, workspaceId), eq(workstreams.key, def.key))).limit(1);
    return existing;
  });
}

/** Return the workspace's workstreams with derived counts. */
export async function listWorkstreamsWithCounts(workspaceId: string): Promise<WorkstreamWithCounts[]> {

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

  const now = new Date();
  const qnaCounts = await db
    .select({
      workstreamId: qnaQuestionWorkstreams.workstreamId,
      openQa: drizzleSql<number>`count(*)::int`,
      overdue: drizzleSql<number>`count(*) filter (where ${qnaQuestions.requestedBy} < ${now})::int`,
    })
    .from(qnaQuestionWorkstreams)
    .innerJoin(qnaQuestions, eq(qnaQuestions.id, qnaQuestionWorkstreams.questionId))
    .where(
      and(
        eq(qnaQuestions.workspaceId, workspaceId),
        drizzleSql`${qnaQuestions.status} != 'approved'`,
      ),
    )
    .groupBy(qnaQuestionWorkstreams.workstreamId);

  const docMap = new Map(docCounts.map((d) => [d.workstreamId, Number(d.count)]));
  const memberMap = new Map(memberCounts.map((m) => [m.workstreamId, Number(m.count)]));
  const qnaMap = new Map(qnaCounts.map((q) => [q.workstreamId, { openQa: Number(q.openQa), overdue: Number(q.overdue) }]));

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
    openQaCount: qnaMap.get(r.id)?.openQa ?? 0,
    overdueCount: qnaMap.get(r.id)?.overdue ?? 0,
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
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');

  const [targetRow] = await db
    .select({ status: workspaceParticipants.status, role: workspaceParticipants.role })
    .from(workspaceParticipants)
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);
  // Distinct errors so the caller can tell the user WHY (vs. an opaque "Forbidden").
  if (!targetRow) throw new Error('ParticipantNotFound');
  if (targetRow.status !== 'active') throw new Error('ParticipantNotActive');
  if (targetRow.role === 'view_only') throw new Error('ParticipantViewOnly');

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
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');

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

export async function getFileWorkstreamIds(fileId: string): Promise<string[]> {
  const rows = await db
    .select({ workstreamId: fileWorkstreams.workstreamId })
    .from(fileWorkstreams)
    .where(eq(fileWorkstreams.fileId, fileId));
  return rows.map((r) => r.workstreamId);
}

export async function setFileWorkstreams(workspaceId: string, fileId: string, workstreamIds: string[]): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');

  const desired = new Set(workstreamIds);

  await db.transaction(async (tx) => {
    const current = await tx
      .select({ workstreamId: fileWorkstreams.workstreamId })
      .from(fileWorkstreams)
      .where(eq(fileWorkstreams.fileId, fileId));
    const currentSet = new Set(current.map((c) => c.workstreamId));

    const toAdd = [...desired].filter((id) => !currentSet.has(id));
    const toRemove = [...currentSet].filter((id) => !desired.has(id));

    if (toAdd.length > 0) {
      await tx
        .insert(fileWorkstreams)
        .values(toAdd.map((workstreamId) => ({ fileId, workstreamId, taggedBy: session.userId })))
        .onConflictDoNothing();
      await logActivity(tx, {
        workspaceId,
        userId: session.userId,
        action: 'document_tagged',
        targetType: 'file',
        targetId: fileId,
        metadata: { added: toAdd },
      });
    }

    if (toRemove.length > 0) {
      await tx
        .delete(fileWorkstreams)
        .where(and(eq(fileWorkstreams.fileId, fileId), inArray(fileWorkstreams.workstreamId, toRemove)));
      await logActivity(tx, {
        workspaceId,
        userId: session.userId,
        action: 'document_untagged',
        targetType: 'file',
        targetId: fileId,
        metadata: { removed: toRemove },
      });
    }
  });
}

export async function updateWorkstream(
  workspaceId: string,
  workstreamId: string,
  patch: { name?: string; description?: string | null },
): Promise<Workstream> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');

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

export async function getWorkstreamActivity(workspaceId: string, workstreamId: string, limit = 8) {
  // Tag events target a file; resolve which files are tagged with this workstream.
  const taggedFiles = await db
    .select({ fileId: fileWorkstreams.fileId })
    .from(fileWorkstreams)
    .where(eq(fileWorkstreams.workstreamId, workstreamId));
  const fileIds = taggedFiles.map((t) => t.fileId);

  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      createdAt: activityLogs.createdAt,
      metadata: activityLogs.metadata,
    })
    .from(activityLogs)
    .innerJoin(users, eq(users.id, activityLogs.userId))
    .where(
      and(
        eq(activityLogs.workspaceId, workspaceId),
        fileIds.length > 0
          ? or(eq(activityLogs.targetId, workstreamId), and(eq(activityLogs.targetType, 'file'), inArray(activityLogs.targetId, fileIds)))
          : eq(activityLogs.targetId, workstreamId),
      ),
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action as ActivityAction,
    actorName: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
    createdAt: r.createdAt,
    metadata: r.metadata,
  }));
}
