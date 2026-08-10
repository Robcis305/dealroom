import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockDbReturning(rows: unknown[]) {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  vi.doMock('@/lib/auth/tokens', () => ({
    hashToken: vi.fn().mockReturnValue('hashed-token'),
  }));
  vi.doMock('@/db/schema', () => ({ magicLinkTokens: {} }));
  vi.doMock('@/db', () => ({
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    },
  }));
  return { deleteWhere };
}

describe('validateMagicLinkToken', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns error=used when no row exists', async () => {
    mockDbReturning([]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'user@example.com');
    expect(result).toEqual({ ok: false, error: 'used' });
  });

  it('returns error=expired when the row is past expiresAt', async () => {
    mockDbReturning([{
      id: 't', email: 'user@example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() - 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    }]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'user@example.com');
    expect(result).toEqual({ ok: false, error: 'expired' });
  });

  it('returns error=invalid when email does not match the row', async () => {
    mockDbReturning([{
      id: 't', email: 'victim@example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    }]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'attacker@example.com');
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('returns ok with the row for a valid token (case-insensitive email)', async () => {
    const row = {
      id: 't', email: 'Mixed@Example.com', tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      purpose: 'login', redirectTo: null,
    };
    mockDbReturning([row]);
    const { validateMagicLinkToken } = await import('./verify-token');
    const result = await validateMagicLinkToken('raw', 'mixed@example.com');
    expect(result).toEqual({ ok: true, tokenRow: row });
  });

  it('never deletes — it is read-only', async () => {
    const { deleteWhere } = mockDbReturning([]);
    const { validateMagicLinkToken } = await import('./verify-token');
    await validateMagicLinkToken('raw', 'user@example.com');
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});
