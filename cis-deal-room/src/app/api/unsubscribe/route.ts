import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get('t');
  if (!t) return Response.json({ error: 'Missing token' }, { status: 400 });

  const payload = verifyUnsubscribeToken(t);
  if (!payload) return Response.json({ error: 'Invalid or expired token' }, { status: 400 });

  const patch =
    payload.channel === 'uploads'
      ? { notifyUploads: false, updatedAt: new Date() }
      : { notifyDigest: false, updatedAt: new Date() };

  await db.update(users).set(patch).where(eq(users.id, payload.userId));

  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h1>Unsubscribed</h1><p>You won't receive further ${payload.channel} emails. You can <a href="/settings">re-enable this in your settings</a>.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
  );
}
