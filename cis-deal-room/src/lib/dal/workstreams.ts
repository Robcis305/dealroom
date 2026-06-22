import { eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db';
import {
  workstreams,
  workstreamMembers,
  fileWorkstreams,
  files,
  workspaceParticipants,
} from '@/db/schema';
import { CANONICAL_WORKSTREAMS } from '@/lib/workstreams/constants';
import type { WorkstreamWithCounts } from '@/types';

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
