import crypto from 'crypto';

/**
 * Generates a cryptographically secure random token.
 * Returns a 64-character hexadecimal string (32 bytes).
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a token using SHA-256.
 * Deterministic — same input always produces same output.
 * Only the hash is stored in the database, never the raw token.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe comparison of two hex token strings.
 * Prevents timing attacks by ensuring comparison time is constant
 * regardless of where strings first differ.
 */
export function timingSafeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
