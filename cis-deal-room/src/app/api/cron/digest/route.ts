import { Receiver } from '@upstash/qstash';
import { eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notificationQueue, users, workspaces } from '@/db/schema';
import { sendEmail } from '@/lib/email/send';
import { DailyDigestEmail } from '@/lib/email/daily-digest';
import { displayName } from '@/lib/users/display';

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export async function POST(request: Request) {
  if (!receiver) {
    if (process.env.NODE_ENV === 'production') {
      return Response.json(
        { error: 'QStash signing keys not configured' },
        { status: 500 }
      );
    }
    console.warn('[cron-digest] QStash keys absent; allowing unsigned invocation in non-prod.');
  } else {
    const body = await request.clone().text();
    const signature = request.headers.get('Upstash-Signature');
    if (!signature) return Response.json({ error: 'Missing signature' }, { status: 401 });
    const valid = await receiver.verify({ signature, body });
    if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const queued = await db
    .select({
      id: notificationQueue.id,
      userId: notificationQueue.userId,
      workspaceId: notificationQueue.workspaceId,
      action: notificationQueue.action,
      targetType: notificationQueue.targetType,
      targetId: notificationQueue.targetId,
      metadata: notificationQueue.metadata,
      createdAt: notificationQueue.createdAt,
    })
    .from(notificationQueue)
    .where(isNull(notificationQueue.processedAt));

  if (queued.length === 0) {
    return Response.json({ processed: 0 });
  }

  const byUser = new Map<string, typeof queued>();
  for (const row of queued) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  const userIds = [...byUser.keys()];
  const workspaceIds = [...new Set(queued.map((q) => q.workspaceId))];

  const userRows = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, userIds));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(inArray(workspaces.id, workspaceIds));
  const workspaceById = new Map(workspaceRows.map((w) => [w.id, w]));

  let processed = 0;
  const processedIds: string[] = [];
  for (const [userId, events] of byUser) {
    const user = userById.get(userId);
    if (!user) continue;

    const digestEvents = events.map((e) => ({
      workspaceName: workspaceById.get(e.workspaceId)?.name ?? 'Deal room',
      action: e.action,
      actorName: 'Someone',
      targetName:
        (e.metadata && typeof (e.metadata as Record<string, unknown>).fileName === 'string'
          ? ((e.metadata as Record<string, unknown>).fileName as string)
          : null) ??
        e.targetType,
      at: e.createdAt.toISOString(),
    }));

    try {
      await sendEmail({
        to: user.email,
        subject: `Your daily deal-room digest — ${events.length} update${events.length === 1 ? '' : 's'}`,
        react: DailyDigestEmail({
          recipientName: displayName(user) !== user.email ? displayName(user) : 'there',
          events: digestEvents,
        }),
      });
      processedIds.push(...events.map((e) => e.id));
      processed += events.length;
    } catch (err) {
      console.warn('[cron-digest] send failure for user', userId, err);
    }
  }

  if (processedIds.length > 0) {
    await db
      .update(notificationQueue)
      .set({ processedAt: new Date() })
      .where(inArray(notificationQueue.id, processedIds));
  }

  return Response.json({ processed, users: byUser.size });
}
