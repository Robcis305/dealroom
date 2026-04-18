import { db } from '@/db';
import { notificationQueue, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/send';
import type { ReactElement } from 'react';
import type { ActivityAction, ActivityTargetType } from '@/types';

type Channel = 'uploads' | 'digest';

interface Input {
  userId: string;
  workspaceId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown>;
  channel: Channel;
  immediateEmail: () => Promise<{
    to: string;
    subject: string;
    react: ReactElement;
  }>;
}

export async function enqueueOrSend(input: Input): Promise<void> {
  const [prefs] = await db
    .select({
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!prefs) return;

  // Per-channel opt-out: bail out entirely if the user disabled this channel.
  if (input.channel === 'uploads' && !prefs.notifyUploads) return;

  if (prefs.notifyDigest) {
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
