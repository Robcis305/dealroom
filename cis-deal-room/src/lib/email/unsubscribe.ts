import crypto from 'crypto';

export type UnsubChannel = 'uploads' | 'digest';
const CHANNELS: readonly UnsubChannel[] = ['uploads', 'digest'];

interface Payload {
  userId: string;
  channel: UnsubChannel;
  exp: number;
}

function getSecret(): Buffer {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s || s.length < 32) throw new Error('UNSUBSCRIBE_SECRET must be set (>=32 chars).');
  return Buffer.from(s, 'utf8');
}

function b64url(b: Buffer) { return b.toString('base64url'); }

export function signUnsubscribeToken(
  fields: { userId: string; channel: UnsubChannel },
  ttlSeconds = 60 * 60 * 24 * 365
): string {
  const body = b64url(
    Buffer.from(JSON.stringify({ ...fields, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  );
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): Payload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let parsed: Payload;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
  } catch {
    return null;
  }
  if (!CHANNELS.includes(parsed.channel)) return null;
  if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) return null;
  return parsed;
}
