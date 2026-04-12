import { eq, gt, and } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import type { Session } from '@/types';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Creates a new database session for the given user.
 * Returns the sessionId (UUID) which is stored in the encrypted cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const now = new Date();
  const [session] = await db
    .insert(sessions)
    .values({ userId, lastActiveAt: now })
    .returning({ id: sessions.id });
  return session.id;
}

/**
 * Validates a session and slides the 24-hour activity window.
 * Returns the Session object if valid, null if expired or not found.
 * The sliding window is updated on every valid access.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.lastActiveAt, cutoff)))
    .limit(1);

  if (!result.length) return null;

  // Slide the 24h window on each valid access
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
  const cookieValue = `cis_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}; Max-Age=${24 * 60 * 60}`;
  response.headers.append('Set-Cookie', cookieValue);
}
