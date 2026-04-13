import { Resend } from 'resend';
import type { ReactElement } from 'react';

/**
 * Thin wrapper over Resend.emails.send that returns a stub response when
 * RESEND_API_KEY is not configured. All Phase 2+ email flows route through
 * this helper so that local development works without Resend credentials.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[email:stub]', { to: input.to, subject: input.subject });
    return { id: 'stub' };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: 'CIS Partners <noreply@cispartners.com>',
    to: input.to,
    subject: input.subject,
    react: input.react,
  });

  return { id: result.data?.id ?? 'unknown' };
}
