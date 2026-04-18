import { describe, it, expect, beforeEach } from 'vitest';
import { signUploadToken, verifyUploadToken } from './upload-token';

describe('upload token', () => {
  beforeEach(() => {
    process.env.UPLOAD_TOKEN_SECRET = 'test-secret-32-bytes-long-minimum-123';
  });

  const payload = {
    s3Key: 'workspaces/w/folders/f/uuid-file.pdf',
    folderId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    workspaceId: '33333333-3333-3333-3333-333333333333',
  };

  it('round-trips a valid signed token', () => {
    const token = signUploadToken(payload, 60);
    const verified = verifyUploadToken(token);
    expect(verified).toMatchObject(payload);
  });

  it('rejects tampered payloads', () => {
    const token = signUploadToken(payload, 60);
    const [head, _body, sig] = token.split('.');
    const tampered = [head, Buffer.from(JSON.stringify({ ...payload, s3Key: 'other' })).toString('base64url'), sig].join('.');
    expect(verifyUploadToken(tampered)).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = signUploadToken(payload, -1); // already expired
    expect(verifyUploadToken(token)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyUploadToken('nope')).toBeNull();
    expect(verifyUploadToken('a.b')).toBeNull();
    expect(verifyUploadToken('')).toBeNull();
  });

  it('throws at sign time if secret is missing', () => {
    delete process.env.UPLOAD_TOKEN_SECRET;
    expect(() => signUploadToken(payload, 60)).toThrow();
  });
});
