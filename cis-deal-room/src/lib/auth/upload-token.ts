import crypto from 'crypto';

export interface UploadTokenPayload {
  s3Key: string;
  folderId: string;
  userId: string;
  workspaceId: string;
  exp: number; // unix seconds
}

function getSecret(): Buffer {
  const s = process.env.UPLOAD_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error('UPLOAD_TOKEN_SECRET must be set (>=32 chars).');
  }
  return Buffer.from(s, 'utf8');
}

function b64url(b: Buffer): string {
  return b.toString('base64url');
}

export function signUploadToken(
  fields: Omit<UploadTokenPayload, 'exp'>,
  ttlSeconds: number
): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'ut' })));
  const payload: UploadTokenPayload = {
    ...fields,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const sig = b64url(
    crypto.createHmac('sha256', getSecret()).update(signingInput).digest()
  );
  return `${signingInput}.${sig}`;
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = b64url(
    crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UploadTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}
