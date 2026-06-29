import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens, users, workspaceParticipants } from '@/db/schema';
import { authVerifyLimiter } from '@/lib/auth/rate-limit';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/app-url';
import { validateMagicLinkToken } from '@/lib/auth/verify-token';

function clientIpFrom(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
}

// Only accept safe relative redirects. Rejects protocol-relative (`//…`) and
// absolute URLs (`http:…`).
function safeRelative(p: string | null | undefined): string | null {
  if (!p) return null;
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//')) return null;
  return p;
}

/**
 * GET — VALIDATE ONLY, never mutates.
 *
 * Email security gateways (Microsoft Safe Links/ATP, Mimecast, Proofpoint)
 * pre-fetch every URL in inbound mail with a GET to scan it. If GET consumed
 * the single-use token, the scanner would burn it before the human clicked.
 * So GET only validates and hands the user to the confirmation interstitial,
 * which POSTs back here to consume the token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get('token');
  const email = searchParams.get('email');
  const appUrl = getAppUrl();

  if (!rawToken || !email) {
    return Response.redirect(`${appUrl}/auth/verify?error=invalid`);
  }

  const rateLimitResult = await authVerifyLimiter.limit(clientIpFrom(request));
  if (!rateLimitResult.success) {
    return Response.redirect(`${appUrl}/auth/verify?error=rate_limited`);
  }

  const result = await validateMagicLinkToken(rawToken, email);
  if (!result.ok) {
    return Response.redirect(`${appUrl}/auth/verify?error=${result.error}`);
  }

  // Valid — send to the confirmation page, carrying the token. The page renders
  // a "Confirm sign-in" button that POSTs back here to consume the token.
  const confirmUrl = new URL(`${appUrl}/auth/verify`);
  confirmUrl.searchParams.set('token', rawToken);
  confirmUrl.searchParams.set('email', email);
  return Response.redirect(confirmUrl.toString());
}

/**
 * POST — the ONLY consuming path. Triggered by the user clicking
 * "Confirm sign-in". Deletes the token, upserts the user, activates pending
 * participants, creates the session, and redirects with 303 See Other so the
 * browser follows with a GET (not a re-POST).
 */
export async function POST(request: NextRequest) {
  const appUrl = getAppUrl();
  const form = await request.formData();
  const rawToken = form.get('token');
  const email = form.get('email');

  if (typeof rawToken !== 'string' || typeof email !== 'string' || !rawToken || !email) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=invalid`, 303);
  }

  const rateLimitResult = await authVerifyLimiter.limit(clientIpFrom(request));
  if (!rateLimitResult.success) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=rate_limited`, 303);
  }

  const result = await validateMagicLinkToken(rawToken, email);
  if (!result.ok) {
    return NextResponse.redirect(`${appUrl}/auth/verify?error=${result.error}`, 303);
  }
  const { tokenRow } = result;

  // Consume the token (single-use contract).
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, tokenRow.tokenHash));

  // Upsert user using tokenRow.email (authoritative, lowercased at write time).
  const [user] = await db
    .insert(users)
    .values({ email: tokenRow.email, isAdmin: false })
    .onConflictDoUpdate({ target: users.email, set: { updatedAt: new Date() } })
    .returning({ id: users.id, firstName: users.firstName, lastName: users.lastName });

  // Activate any pending participant rows for this authenticated user (runs for
  // login OR invitation tokens — see route history for the race rationale).
  await db
    .update(workspaceParticipants)
    .set({ status: 'active', activatedAt: new Date() })
    .where(
      and(
        eq(workspaceParticipants.userId, user.id),
        eq(workspaceParticipants.status, 'invited'),
      ),
    );

  const sessionId = await createSession(user.id);
  const needsProfile = !user.firstName || !user.lastName;
  const safeRedirect = safeRelative(tokenRow.redirectTo);
  const redirectPath = needsProfile
    ? '/complete-profile'
    : tokenRow.purpose === 'invitation' && safeRedirect
      ? safeRedirect
      : '/deals';

  // 303 See Other: a POST that returns 307 would make the browser re-POST to
  // the redirect target. 303 forces a GET to redirectPath.
  const response = NextResponse.redirect(new URL(`${appUrl}${redirectPath}`), 303);
  setSessionCookie(response, sessionId);
  return response;
}
