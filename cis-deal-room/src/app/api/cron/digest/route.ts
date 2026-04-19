import { Receiver } from '@upstash/qstash';
import { sql, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users, workspaces, notificationQueue } from '@/db/schema';
import { sendEmail } from '@/lib/email/send';
import { DailyDigestEmail } from '@/lib/email/daily-digest';
import { signUnsubscribeToken } from '@/lib/email/unsubscribe';
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Atomic claim: mark all unprocessed rows processed_at=now() and RETURN them.
  // A second overlapping invocation will find zero unclaimed rows.
  const claimed = (await db.execute(sql`
    WITH claimed AS (
      UPDATE notification_queue
         SET processed_at = now()
       WHERE processed_at IS NULL
         AND attempts < 5
      RETURNING id, user_id, workspace_id, action, target_type, target_id, metadata, attempts, created_at
    )
    SELECT * FROM claimed
  `)) as unknown as {
    rows: Array<{
      id: string; user_id: string; workspace_id: string; action: string;
      target_type: string; target_id: string | null; metadata: unknown;
      attempts: number; created_at: Date;
    }>;
  };

  const queued = claimed.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    workspaceId: r.workspace_id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    metadata: r.metadata,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));

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

    const unsubToken = signUnsubscribeToken({ userId, channel: 'digest' });
    const unsubscribeUrl = `${appUrl}/api/unsubscribe?t=${encodeURIComponent(unsubToken)}`;

    try {
      await sendEmail({
        to: user.email,
        subject: `Your daily deal-room digest — ${events.length} update${events.length === 1 ? '' : 's'}`,
        react: DailyDigestEmail({
          recipientName: displayName(user) !== user.email ? displayName(user) : 'there',
          events: digestEvents,
          unsubscribeUrl,
        }),
      });
      processed += events.length;
    } catch (err) {
      console.warn('[cron-digest] send failure for user', userId, err);
      const msg = err instanceof Error ? err.message : 'unknown';
      await db
        .update(notificationQueue)
        .set({
          processedAt: null,
          attempts: sql`${notificationQueue.attempts} + 1`,
          lastError: msg.slice(0, 500),
        })
        .where(inArray(notificationQueue.id, events.map((e) => e.id)));
    }
  }

  return Response.json({ processed, users: byUser.size });
}
