import { activityLogs } from '@/db/schema';
import type { ActivityAction, ActivityTargetType } from '@/types';

/**
 * Minimal interface shared by the db singleton and Drizzle transaction objects.
 * Both expose an `insert` method with the same signature.
 */
export interface DbLike {
  insert: <T extends object>(table: T) => { values: (values: object | object[]) => Promise<unknown> };
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txOrDb: any,
  params: {
    workspaceId: string;
    userId: string;
    action: ActivityAction;
    targetType: ActivityTargetType;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await txOrDb.insert(activityLogs).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    metadata: params.metadata ?? null,
  });
}
