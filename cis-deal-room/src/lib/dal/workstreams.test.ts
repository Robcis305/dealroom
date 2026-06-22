import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

describe('listWorkstreamsWithCounts()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('seeds then returns 5 workstreams ordered by sortOrder with counts merged', async () => {
    // ensureWorkstreams insert → onConflictDoNothing chain
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    // listWorkstreamsWithCounts reads: workstreams rows, doc counts, member counts
    const wsRows = [
      { id: 'w-legal', workspaceId: 'ws-1', key: 'legal', name: 'Legal', color: '#33322F', tileTint: '#ECEBE6', description: 'd', sortOrder: 0 },
    ];
    const select = vi.fn()
      // 1st select: workstreams
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue(wsRows) }) }) })
      // 2nd select: doc counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 31 }]) }) }) }) })
      // 3rd select: member counts grouped
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ groupBy: vi.fn().mockResolvedValue([{ workstreamId: 'w-legal', count: 6 }]) }) }) }) });

    vi.doMock('@/db', () => ({ db: { insert, select } }));
    vi.doMock('@/db/schema', () => ({ workstreams: {}, workstreamMembers: {}, fileWorkstreams: {}, files: {}, workspaceParticipants: {} }));

    const { listWorkstreamsWithCounts } = await import('./workstreams');
    const result = await listWorkstreamsWithCounts('ws-1');

    expect(insert).toHaveBeenCalled(); // seeded
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'legal', docCount: 31, memberCount: 6, openQaCount: 0, overdueCount: 0 });
  });
});
