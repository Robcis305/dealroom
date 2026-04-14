import { db } from '@/db';
import { notificationQueue, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/send';
import type { ReactElement } from 'react';
import type { ActivityAction, ActivityTargetType } from '@/types';

interface Input {
  userId: string;
  workspaceId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown>;
  /** Callback to produce the immediate-email payload when digest is off */
  immediateEmail: () => Promise<{
    to: string;
    subject: string;
    react: ReactElement;
  }>;
}

/**
 * Central point for routing notifications. Reads the target user's
 * notification_digest preference: if true, enqueues for the daily
 * batch; if false, sends immediately via sendEmail().
 */
export async function enqueueOrSend(input: Input): Promise<void> {
  const [user] = await db
    .select({ notificationDigest: users.notificationDigest })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (user?.notificationDigest) {
    await db.insert(notificationQueue).values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
    return;
  }

  const payload = await input.immediateEmail();
  await sendEmail(payload);
}
