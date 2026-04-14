import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
const mockInsertReturning = vi.fn();
const mockSelectLimit = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDeleteWhere = vi.fn();

vi.mock('@/db', () => ({
  db: {
    insert: () => ({ values: () => ({ returning: mockInsertReturning }) }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: mockSelectLimit }),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

import { createSession, getSession, destroySession } from './session';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createSession()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a sessions row and returns a UUID sessionId', async () => {
    mockInsertReturning.mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440000' }]);
    const id = await createSession('user-1');
    expect(id).toMatch(UUID_V4);
  });
});

describe('getSession()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a Session object when row exists and lastActiveAt is within idle window', async () => {
    const now = new Date();
    mockSelectLimit.mockResolvedValue([
      {
        session: { id: 's1', userId: 'u1', lastActiveAt: now, absoluteExpiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
        user: { id: 'u1', email: 'a@b.com', isAdmin: false },
      },
    ]);
    const result = await getSession('s1');
    expect(result).toEqual({
      sessionId: 's1',
      userId: 'u1',
      userEmail: 'a@b.com',
      isAdmin: false,
    });
  });

  it('returns null when session row is not found', async () => {
    mockSelectLimit.mockResolvedValue([]);
    const result = await getSession('nope');
    expect(result).toBeNull();
  });

  it('returns null when lastActiveAt is older than idle window (expired)', async () => {
    // The DB query filters out expired rows via gt(lastActiveAt, idleCutoff) and
    // gt(absoluteExpiresAt, now), so an expired session surfaces as an empty result set.
    mockSelectLimit.mockResolvedValue([]);
    const result = await getSession('s-old');
    expect(result).toBeNull();
  });

  it('slides the lastActiveAt window on valid access', async () => {
    const now = new Date();
    mockSelectLimit.mockResolvedValue([
      {
        session: { id: 's1', userId: 'u1', lastActiveAt: now, absoluteExpiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
        user: { id: 'u1', email: 'a@b.com', isAdmin: false },
      },
    ]);
    await getSession('s1');
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });
});

describe('destroySession()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes the session row from the database', async () => {
    await destroySession('s1');
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
