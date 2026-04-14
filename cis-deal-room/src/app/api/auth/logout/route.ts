import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession } from '@/lib/auth/session';

/**
 * POST /api/auth/logout — destroys the current session and clears the cookie.
 * Idempotent: safe to call when already logged out.
 */
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('cis_session')?.value;

  if (sessionId) {
    try {
      await destroySession(sessionId);
    } catch {
      // destroy is best-effort — even if DB call fails, we still clear the cookie
    }
  }

  const response = NextResponse.json({ success: true });
  // Overwrite the cookie with Max-Age=0 to expire it client-side
  response.headers.append(
    'Set-Cookie',
    `cis_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return response;
}
