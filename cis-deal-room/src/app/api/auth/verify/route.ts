import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens, users, workspaceParticipants } from '@/db/schema';
import { hashToken } from '@/lib/auth/tokens';
import { authVerifyLimiter } from '@/lib/auth/rate-limit';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get('token');
  const email = searchParams.get('email');

  const appUrl = getAppUrl();

  if (!rawToken || !email) {
    return Response.redirect(`${appUrl}/auth/verify?error=invalid`);
  }

  // 1. Rate limit by IP — authVerifyLimiter: 10 attempts per IP per 15 minutes
  const clientIP =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const rateLimitResult = await authVerifyLimiter.limit(clientIP);
  if (!rateLimitResult.success) {
    return Response.redirect(`${appUrl}/auth/verify?error=rate_limited`);
  }

  // 2. Hash the raw token and look up in the database
  const tokenHash = hashToken(rawToken);
  const [tokenRow] = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  // 3. No row found → already consumed (single-use) or never existed
  if (!tokenRow) {
    return Response.redirect(`${appUrl}/auth/verify?error=used`);
  }

  // 4. Row exists but expired → delete it and redirect with expired error
  if (tokenRow.expiresAt < new Date()) {
    await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, tokenHash));
    return Response.redirect(`${appUrl}/auth/verify?error=expired`);
  }

  // 5. Binding check: the query-param email must match the token row.
  // Prevents an attacker who observes a magic link from swapping ?email=
  // to impersonate an arbitrary user. Compared case-insensitively so links
  // mangled by email clients (e.g. lowercased) still resolve.
  if (tokenRow.email.toLowerCase() !== email.toLowerCase()) {
    return Response.redirect(`${appUrl}/auth/verify?error=invalid`);
  }

  // 6. Valid token → consume it (single-use contract)
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.tokenHash, tokenHash));

  // 7. Upsert user using tokenRow.email (authoritative, not the query param).
  // Token rows are written with lowercased emails, so the unique-key conflict
  // target resolves deterministically.
  const [user] = await db
    .insert(users)
    .values({ email: tokenRow.email, isAdmin: false })
    .onConflictDoUpdate({
      target: users.email,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id, firstName: users.firstName, lastName: users.lastName });

  // 8. Activate any pending participant rows for this authenticated user.
  // Runs for every successful auth (login OR invitation), not just invitation
  // tokens — otherwise a user who races their invite link with a /login link
  // (the send route deletes prior tokens) ends up authenticated but with
  // status='invited' and an empty deal-rooms list.
  await db
    .update(workspaceParticipants)
    .set({ status: 'active', activatedAt: new Date() })
    .where(
      and(
        eq(workspaceParticipants.userId, user.id),
        eq(workspaceParticipants.status, 'invited')
      )
    );

  // 8. Create database session and set cookie
  const sessionId = await createSession(user.id);

  const needsProfile = !user.firstName || !user.lastName;

  // Defense-in-depth: only accept safe relative redirects.
  // Rejects protocol-relative (`//…`) and absolute URLs (`http:…`).
  function safeRelative(p: string | null | undefined): string | null {
    if (!p) return null;
    if (!p.startsWith('/')) return null;
    if (p.startsWith('//')) return null;
    return p;
  }

  const safeRedirect = safeRelative(tokenRow.redirectTo);

  const redirectPath = needsProfile
    ? '/complete-profile'
    : tokenRow.purpose === 'invitation' && safeRedirect
      ? safeRedirect
      : '/deals';

  // Use NextResponse (mutable cookies API) instead of Response.redirect —
  // the Fetch spec's Response.redirect() returns an immutable-headers
  // response, so .headers.append('Set-Cookie', ...) throws TypeError.
  const response = NextResponse.redirect(new URL(`${appUrl}${redirectPath}`));
  setSessionCookie(response, sessionId);

  return response;
}
