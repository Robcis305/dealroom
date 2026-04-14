import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens } from '@/db/schema';
import { generateToken, hashToken } from '@/lib/auth/tokens';
import { authSendLimiter } from '@/lib/auth/rate-limit';
import { MagicLinkEmail } from '@/lib/email/magic-link';
import { sendEmail } from '@/lib/email/send';

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  // 1. Parse and validate request body
  let email: string;
  try {
    const body = await request.json();
    const parsed = bodySchema.parse(body);
    email = parsed.email;
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

  // 4. Remove any existing unused tokens for this email (fresh link invalidates old ones)
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email));

  // 5. Store the hash (never the raw token)
  await db.insert(magicLinkTokens).values({ email, tokenHash, expiresAt });

  // 6. Build the magic link URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const magicLink = `${appUrl}/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;

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
