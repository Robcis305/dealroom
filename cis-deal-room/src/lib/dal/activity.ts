import { db } from '@/db';
import { activityLogs } from '@/db/schema';
import type { ActivityAction, ActivityTargetType } from '@/types';

type DbOrTx = typeof db | Parameters<typeof db.transaction>[0];

/**
 * Appends an immutable activity log row.
 *
 * INSERT ONLY — no UPDATE or DELETE ever. This is the ACTY-01 immutability contract.
 *
 * @param txOrDb - Either the db singleton or a Drizzle transaction object.
 *                 Pass the transaction when calling inside db.transaction() so
 *                 the activity log participates in the same atomic operation.
 */
export async function logActivity(
  txOrDb: DbOrTx,
  params: {
    workspaceId: string;
    userId: string;
    action: ActivityAction;
    targetType: ActivityTargetType;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await (txOrDb as typeof db).insert(activityLogs).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    metadata: params.metadata ?? null,
  });
}
