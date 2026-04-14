import { eq, gt, and } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import type { Session } from '@/types';

const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_ABSOLUTE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Creates a new database session for the given user.
 * Returns the sessionId (UUID) which is stored in the encrypted cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const now = new Date();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      lastActiveAt: now,
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    })
    .returning({ id: sessions.id });
  return session.id;
}

/**
 * Validates a session against a 2h idle window and 4h absolute cap.
 * Returns the Session object if valid, null if expired or not found.
 * The idle window is slid on every valid access.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const idleCutoff = new Date(Date.now() - SESSION_IDLE_MS);
  const now = new Date();

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.lastActiveAt, idleCutoff),
        gt(sessions.absoluteExpiresAt, now)
      )
    )
    .limit(1);

  if (!result.length) return null;

  await db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return {
    sessionId,
    userId: result[0].user.id,
    userEmail: result[0].user.email,
    isAdmin: result[0].user.isAdmin,
  };
}

/**
 * Destroys a session by deleting the sessions table row.
 * Used on logout or admin revocation.
 */
export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Sets the encrypted session cookie on a Response object.
 * Cookie name: 'cis_session' — httpOnly, secure in production.
 */
export function setSessionCookie(response: Response, sessionId: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieValue = `cis_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}; Max-Age=${4 * 60 * 60}`;
  response.headers.append('Set-Cookie', cookieValue);
}
