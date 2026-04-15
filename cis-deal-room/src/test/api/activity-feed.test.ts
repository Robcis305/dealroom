import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/workspaces/[id]/activity/route';

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));
vi.mock('@/lib/dal/access', () => ({
  requireDealAccess: vi.fn(),
}));
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { db } from '@/db';

describe("GET /api/workspaces/[id]/activity — filter 'previewed'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u1' } as never);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined as never);
  });

  it("adds a 'previewed' exclusion to the where clause", async () => {
    let whereClause: unknown = null;
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.innerJoin = () => chain;
    chain.where = (clause: unknown) => {
      whereClause = clause;
      return chain;
    };
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.offset = async () => [];
    vi.mocked(db.select).mockReturnValue(chain as never);

    const res = await GET(
      new Request('http://localhost/api/workspaces/w1/activity'),
      { params: Promise.resolve({ id: 'w1' }) }
    );
    expect(res.status).toBe(200);
    // Drizzle ORM expression objects contain circular refs so JSON.stringify fails.
    // Use util.inspect which handles cycles.
    // The ne() operator serializes as a StringChunk containing ' <> '.
    // Assert both the operator and the literal 'previewed' are present in the
    // where clause, proving ne(activityLogs.action, 'previewed') was applied.
    const { inspect } = await import('util');
    const serialized = inspect(whereClause, { depth: null, breakLength: Infinity });
    // 'previewed' appears in the schema enum regardless; we need the <> operator
    // to confirm ne() was used (as opposed to eq() which uses ' = ').
    expect(serialized).toMatch(/<>/);
    expect(serialized).toContain("'previewed'");
  });
});
