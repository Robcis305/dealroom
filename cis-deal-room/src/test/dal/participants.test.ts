import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectChain = vi.fn();
const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockTransaction = vi.fn();

/**
 * A "thennable-with-limit" object:
 * - calling .limit(n) returns mockSelectChain() (the promise)
 * - awaiting it directly (then/catch) also delegates to mockSelectChain()
 * This covers both db.select()…where().limit(1) and db.select()…where() (awaited directly).
 */
function makeWhereResult() {
  const obj: {
    limit: typeof mockSelectChain;
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => unknown;
    catch: (onRejected: (e: unknown) => unknown) => unknown;
  } = {
    limit: mockSelectChain,
    then(onFulfilled, onRejected) {
      return mockSelectChain().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return mockSelectChain().catch(onRejected);
    },
  };
  return obj;
}

vi.mock('@/db', () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      mockTransaction(fn);
      return fn({
        select: () => ({ from: () => ({ where: () => makeTxWhereResult() }) }),
        insert: () => ({ values: (v: unknown) => { mockInsertValues(v); return { returning: mockInsertReturning }; } }),
        update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
        delete: () => ({ where: mockDeleteWhere }),
      });
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => makeWhereResult(),
          leftJoin: () => ({
            where: () => ({
              groupBy: () => makeWhereResult(),
            }),
          }),
        }),
        where: () => makeWhereResult(),
      }),
    }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

/**
 * Like makeWhereResult but for inside transactions:
 * supports both .limit(n) and direct await (for queries without .limit).
 */
function makeTxWhereResult() {
  const obj: {
    limit: typeof mockSelectChain;
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => unknown;
    catch: (onRejected: (e: unknown) => unknown) => unknown;
  } = {
    limit: mockSelectChain,
    then(onFulfilled, onRejected) {
      return mockSelectChain().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return mockSelectChain().catch(onRejected);
    },
  };
  return obj;
}

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('@/lib/auth/tokens', () => ({
  generateToken: vi.fn().mockReturnValue('raw-token-abc'),
  hashToken: vi.fn().mockReturnValue('hashed-token-xyz'),
}));

import { verifySession } from '@/lib/dal/index';
import {
  getParticipants,
  inviteParticipant,
  updateParticipant,
  removeParticipant,
  countActiveClientParticipants,
} from '@/lib/dal/participants';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PARTICIPANT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('getParticipants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(getParticipants(WORKSPACE_ID)).rejects.toThrow('Unauthorized');
  });

  it('returns participant rows joined with user email', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    // getParticipants uses db.select().from().innerJoin().where() — awaited directly (no .limit())
    // makeWhereResult delegates .then() to mockSelectChain(), so setting mockSelectChain here works.
    const rows = [
      { id: 'p1', userId: 'u1', email: 'a@b.com', role: 'client', status: 'active', folderIds: [] },
    ];
    mockSelectChain.mockResolvedValue(rows);

    const result = await getParticipants(WORKSPACE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('a@b.com');
  });
});

describe('inviteParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(
      inviteParticipant({ workspaceId: WORKSPACE_ID, email: 'x@y.com', role: 'client', folderIds: [] })
    ).rejects.toThrow('Unauthorized');
  });

  it('throws Admin required for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...adminSession, isAdmin: false });
    await expect(
      inviteParticipant({ workspaceId: WORKSPACE_ID, email: 'x@y.com', role: 'client', folderIds: [] })
    ).rejects.toThrow('Admin required');
  });

  it('creates participant row and returns it', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    // user lookup returns existing user, then participant lookup returns none (new participant)
    mockSelectChain
      .mockResolvedValueOnce([{ id: 'user-1' }])        // user exists
      .mockResolvedValueOnce([]);                          // no existing participant
    mockInsertReturning
      .mockResolvedValueOnce([{ id: 'p1', userId: 'user-1', role: 'client', status: 'invited' }]); // participant insert
    const result = await inviteParticipant({
      workspaceId: WORKSPACE_ID,
      email: 'x@y.com',
      role: 'client',
      folderIds: [],
    });
    expect(result.participant.id).toBe('p1');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns rawToken', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain
      .mockResolvedValueOnce([{ id: 'user-1' }])  // user exists
      .mockResolvedValueOnce([]);                   // no existing participant
    mockInsertReturning
      .mockResolvedValueOnce([{ id: 'p1', userId: 'user-1', role: 'client', status: 'invited' }]);

    // generateToken mock returns 'raw-token-abc' by default — override with a 64-char hex string
    const { generateToken } = await import('@/lib/auth/tokens');
    vi.mocked(generateToken).mockReturnValue('a'.repeat(64));

    const result = await inviteParticipant({
      workspaceId: WORKSPACE_ID,
      email: 'x@y.com',
      role: 'client',
      folderIds: [],
    });
    expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/i);
  });

  it('re-invite updates role and refreshes token for existing participant', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);

    const existingParticipant = {
      id: 'p-existing',
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      role: 'client' as const,
      status: 'invited' as const,
    };

    // Sequence: user lookup → existing user, participant lookup → existing participant
    mockSelectChain
      .mockResolvedValueOnce([{ id: 'user-1' }])       // user exists
      .mockResolvedValueOnce([existingParticipant]);     // participant exists (re-invite)

    const result = await inviteParticipant({
      workspaceId: WORKSPACE_ID,
      email: 'x@y.com',
      role: 'counsel',
      folderIds: [],
    });

    // Transaction should have been called once
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // No new participant row should have been inserted (mockInsertReturning not called for participant)
    // The insert mock captures ALL insert values — none should look like a workspaceParticipants row
    const participantInsertCalls = mockInsertValues.mock.calls.filter(
      (args: unknown[]) => {
        const v = args[0];
        return v !== null && typeof v === 'object' && 'workspaceId' in (v as object) && 'userId' in (v as object);
      }
    );
    expect(participantInsertCalls).toHaveLength(0);

    // The returned participant should have the new role from input
    expect(result.participant.role).toBe('counsel');
  });
});

describe('removeParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Admin required for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...adminSession, isAdmin: false });
    await expect(removeParticipant(PARTICIPANT_ID)).rejects.toThrow('Admin required');
  });

  it('throws when admin tries to remove themselves', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: adminSession.userId, email: 'admin@cis.com', role: 'admin' },
    ]);
    await expect(removeParticipant(PARTICIPANT_ID)).rejects.toThrow('Cannot remove self');
  });

  it('deletes participant row for different user', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: 'other-u', email: 'other@x.com', role: 'client' },
    ]);
    await removeParticipant(PARTICIPANT_ID);
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});

describe('countActiveClientParticipants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(countActiveClientParticipants(WORKSPACE_ID)).rejects.toThrow('Unauthorized');
  });

  it('returns 0 when no active client participants', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([{ count: 0 }]);
    const result = await countActiveClientParticipants(WORKSPACE_ID);
    expect(result).toBe(0);
  });

  it('returns the count of active client participants', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([{ count: 3 }]);
    const result = await countActiveClientParticipants(WORKSPACE_ID);
    expect(result).toBe(3);
  });
});

describe('updateParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when admin tries to demote their own role', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: adminSession.userId, email: 'admin@cis.com', role: 'admin' },
    ]);
    await expect(
      updateParticipant(PARTICIPANT_ID, { role: 'client', folderIds: [] })
    ).rejects.toThrow('Cannot demote self');
  });
});
