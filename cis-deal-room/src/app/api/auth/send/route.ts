import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens } from '@/db/schema';
import { generateToken, hashToken } from '@/lib/auth/tokens';
import { authSendLimiter } from '@/lib/auth/rate-limit';
import { isSameOriginRequest } from '@/lib/auth/csrf';
import { getAppUrl } from '@/lib/app-url';
import { MagicLinkEmail } from '@/lib/email/magic-link';
import { sendEmail } from '@/lib/email/send';

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Parse and validate request body. Lowercase the email so the unique
  // constraint and find-or-create logic in invite + verify all key off the
  // same canonical form regardless of how the user typed it.
  let email: string;
  try {
    const body = await request.json();
    const parsed = bodySchema.parse(body);
    email = parsed.email.toLowerCase();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 2. Rate limit by email — authSendLimiter: 5 requests per email per 15 minutes
  const rateLimitResult = await authSendLimiter.limit(email);
  if (!rateLimitResult.success) {
    return Response.json(
      { error: 'Too many requests. Please wait before requesting another link.' },
      { status: 429 }
    );
  }

  // 3. Generate token and compute expiry (10 minutes)
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // 4. Remove any existing unused login tokens for this email (fresh link
  // invalidates old ones). Scoped to purpose='login' so a fresh /login
  // request does not clobber a still-pending invitation token.
  await db
    .delete(magicLinkTokens)
    .where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.purpose, 'login')));

  // 5. Store the hash (never the raw token)
  await db.insert(magicLinkTokens).values({ email, tokenHash, expiresAt });

  // 6. Build the magic link URL
  const appUrl = getAppUrl();
  const magicLink = `${appUrl}/api/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;

  // Dev-mode convenience: when Resend is stubbed, surface the link in the
  // server log so a developer can copy/paste it directly.
  if (!process.env.RESEND_API_KEY) {
    console.log('[auth:login-link]', magicLink);
  }

  // 7. Send email via Resend using React Email template
  await sendEmail({
    to: email,
    subject: 'Your CIS Deal Room sign-in link',
    react: MagicLinkEmail({ magicLink, email }),
  });

  return Response.json({ success: true });
}
