import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// DB mock — supports the two sequential selects in listItemsForViewer:
//   1. workspace lookup  (.select().from().where().limit(1))
//   2. participant lookup (.select().from().where().limit(1))
// mockSelectChain drives both via mockResolvedValueOnce queuing.
// ---------------------------------------------------------------------------
const mockSelectChain = vi.fn();

function makeWhereResult() {
  return {
    limit: mockSelectChain,
    orderBy: () => makeWhereResult(),
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return mockSelectChain().then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return mockSelectChain().catch(onRejected);
    },
  };
}

const mockInsertChain = vi.fn().mockResolvedValue([{ id: 'new-ci-id' }]);
const mockUpdateChain = vi.fn().mockResolvedValue([]);
const mockTransactionFn = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => makeWhereResult(),
      }),
    }),
    transaction: (...args: Parameters<typeof mockTransactionFn>) => mockTransactionFn(...args),
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { ownerFilterForSession, listItemsForViewer, setCanonicalItemStatus } from '@/lib/dal/checklist';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('ownerFilterForSession', () => {
  it('returns null for admin (sees all)', () => {
    expect(
      ownerFilterForSession({ isAdmin: true, role: 'admin', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toBeNull();
  });

  it('returns null for cis_team (sees all)', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'cis_team', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toBeNull();
  });

  it('returns [seller, both] for seller_rep', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'seller_rep', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('returns [buyer, both] for buyer_counsel', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'buyer_counsel', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toEqual(['buyer', 'both']);
  });

  it('derives client owner filter from workspace.cisAdvisorySide', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'client', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['buyer', 'both']);
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'client', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('uses shadow side for view_only', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'view_only', shadowSide: 'seller', cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('returns empty (no visibility) for deprecated counsel role', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'counsel', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual([]);
  });
});

describe('setCanonicalItemStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertChain.mockResolvedValue([{ id: 'new-ci-id' }]);
    mockUpdateChain.mockResolvedValue([]);
  });

  it('inserts a checklist_items row when none exists for the (checklist, playbook_item)', async () => {
    const session = { userId: 'admin', isAdmin: true, userEmail: 'a@a' };
    vi.mocked(verifySession).mockResolvedValueOnce(session as any);

    // tx mock: resolves select calls in order:
    //   1. playbookItems lookup → [{ id, category, name, defaultPriority, number }]
    //   2. checklists lookup → [{ id, workspaceId }]
    //   3. existing checklistItems lookup → [] (no row yet)
    const txSelectChain = vi.fn()
      .mockResolvedValueOnce([{ id: 'pb-5', category: 'corporate', name: 'Test Item', defaultPriority: 'medium', number: 5 }])
      .mockResolvedValueOnce([{ id: 'cl-1', workspaceId: 'ws-1' }])
      .mockResolvedValueOnce([]); // no existing checklist_items row

    const tx = {
      select: () => ({ from: () => ({ where: () => ({ limit: txSelectChain }) }) }),
      insert: () => ({ values: () => ({ returning: mockInsertChain }) }),
      update: () => ({ set: () => ({ where: mockUpdateChain }) }),
    };

    mockTransactionFn.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await setCanonicalItemStatus({
      checklistId: 'cl-1',
      playbookItemId: 'pb-5',
      target: 'received',
    });

    expect(verifySession).toHaveBeenCalled();
    expect(mockInsertChain).toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', isAdmin: false, userEmail: 'u@u',
    } as any);
    await expect(
      setCanonicalItemStatus({
        checklistId: 'cl-1',
        playbookItemId: 'pb-5',
        target: 'received',
      }),
    ).rejects.toThrow('Admin required');
  });
});

describe('listItemsForViewer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns [] immediately when viewer has no visibility (empty filter short-circuit)', async () => {
    // Non-admin session
    vi.mocked(verifySession).mockResolvedValue({
      sessionId: 's1',
      userId: 'user-1',
      userEmail: 'user@test.com',
      isAdmin: false,
    });

    // Workspace lookup returns a row
    mockSelectChain
      .mockResolvedValueOnce([{ cisAdvisorySide: 'buyer_side' }])
      // Participant lookup: role 'counsel' → ownerFilterForSession returns []
      .mockResolvedValueOnce([{ role: 'counsel', shadow: null }]);

    const result = await listItemsForViewer(WORKSPACE_ID);
    expect(result).toEqual([]);
    // Confirm we short-circuited: no further DB calls for checklist/items
    // mockSelectChain should have been called exactly twice (workspace + participant)
    expect(mockSelectChain).toHaveBeenCalledTimes(2);
  });
});
