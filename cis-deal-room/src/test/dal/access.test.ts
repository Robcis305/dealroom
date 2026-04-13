import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectLimit = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
  },
}));

import { requireDealAccess } from '@/lib/dal/access';

const adminSession = { sessionId: 's1', userId: 'u1', userEmail: 'admin@cis.com', isAdmin: true };
const clientSession = { sessionId: 's2', userId: 'u2', userEmail: 'client@acme.com', isAdmin: false };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('requireDealAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin bypasses and does not query DB', async () => {
    await requireDealAccess(WORKSPACE_ID, adminSession);
    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('non-admin with active participant row resolves', async () => {
    mockSelectLimit.mockResolvedValue([{ id: 'p1', status: 'active' }]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).resolves.toBeUndefined();
  });

  it('non-admin with no participant row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });

  it('non-admin with only an invited (not active) row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });
});
