import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { magicLinkTokens } from '@/db/schema';
import { hashToken } from '@/lib/auth/tokens';

export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;

export type MagicLinkValidation =
  | { ok: true; tokenRow: MagicLinkTokenRow }
  | { ok: false; error: 'used' | 'expired' | 'invalid' };

/**
 * Validates a raw magic-link token against the database WITHOUT consuming it.
 * Read-only: never deletes or mutates. Both the non-consuming GET and the
 * consuming POST on /api/auth/verify call this; only POST then deletes the row.
 *
 * - no row            → 'used'    (already consumed, or never existed)
 * - past expiresAt    → 'expired'
 * - email mismatch    → 'invalid' (case-insensitive; defends against ?email swap)
 */
export async function validateMagicLinkToken(
  rawToken: string,
  email: string,
): Promise<MagicLinkValidation> {
  const tokenHash = hashToken(rawToken);
  const [tokenRow] = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) return { ok: false, error: 'used' };
  if (tokenRow.expiresAt < new Date()) return { ok: false, error: 'expired' };
  if (tokenRow.email.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, error: 'invalid' };
  }
  return { ok: true, tokenRow };
}
