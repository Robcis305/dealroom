import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { safeHeader, safeEmailAddress } from './safe-field';

/**
 * Thin wrapper over Resend.emails.send that returns a stub response when
 * RESEND_API_KEY is not configured. Sanitises subject/to/from to prevent
 * header injection if a user-controlled value ever reaches them.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  const safeTo = safeEmailAddress(input.to);
  if (!safeTo) throw new Error('Invalid recipient email');
  const safeSubject = safeHeader(input.subject);

  if (!apiKey) {
    console.log('[email:stub]', { to: safeTo, subject: safeSubject });
    return { id: 'stub' };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: 'CIS Partners <noreply@mail.cispartners.co>',
    to: safeTo,
    subject: safeSubject,
    react: input.react,
  });

  return { id: result.data?.id ?? 'unknown' };
}
