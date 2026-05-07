import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/checklist', () => ({
  setCanonicalItemStatus: vi.fn(),
  getChecklistForWorkspace: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { setCanonicalItemStatus } from '@/lib/dal/checklist';

describe('cap-table DAL — auth gates', () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockReset();
    vi.mocked(setCanonicalItemStatus).mockReset();
  });

  it('publishCapTable rejects non-admin sessions', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', userEmail: 'u@u', isAdmin: false,
    } as any);
    const { publishCapTable } = await import('@/lib/dal/cap-table');
    await expect(publishCapTable('ws-1')).rejects.toThrow('Admin required');
  });

  it('unpublishCapTable rejects non-admin sessions', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', userEmail: 'u@u', isAdmin: false,
    } as any);
    const { unpublishCapTable } = await import('@/lib/dal/cap-table');
    await expect(unpublishCapTable('ws-1')).rejects.toThrow('Admin required');
  });

  it('uploadCapTable rejects non-admin sessions', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', userEmail: 'u@u', isAdmin: false,
    } as any);
    const { uploadCapTable } = await import('@/lib/dal/cap-table');
    await expect(
      uploadCapTable({
        workspaceId: 'ws-1',
        fileId: 'f-1',
        rows: [],
        warnings: [],
      }),
    ).rejects.toThrow('Admin required');
  });
});

describe('cap-table DAL — visibility gate (getCapTableForViewer)', () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockReset();
  });

  // The visibility gate is a pure function over (cap_table.status, role, shadowSide, cisAdvisorySide).
  // We test it via the exported `applyCapTableVisibilityGate` helper.
  it('returns full data for admin even when status=draft', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: true,
      role: 'admin',
      shadowSide: null,
      cisAdvisorySide: 'seller_side',
    });
    expect(result).toEqual({ visible: true });
  });

  it('returns hidden for buyer_rep when status=draft', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'buyer_rep',
      shadowSide: null,
      cisAdvisorySide: 'seller_side',
    });
    expect(result).toEqual({ visible: false });
  });

  it('returns full data for buyer_rep when status=published', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'published' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'buyer_rep',
      shadowSide: null,
      cisAdvisorySide: 'seller_side',
    });
    expect(result).toEqual({ visible: true });
  });

  it('returns full data for client on sell-side workspace (draft)', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'client',
      shadowSide: null,
      cisAdvisorySide: 'seller_side',
    });
    expect(result).toEqual({ visible: true });
  });

  it('returns hidden for client on buy-side workspace (draft)', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'client',
      shadowSide: null,
      cisAdvisorySide: 'buyer_side',
    });
    expect(result).toEqual({ visible: false });
  });

  it('returns full data for view_only with shadow=seller (any status)', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'view_only',
      shadowSide: 'seller',
      cisAdvisorySide: 'buyer_side',
    });
    expect(result).toEqual({ visible: true });
  });

  it('returns hidden for view_only with shadow=buyer (status=draft)', async () => {
    const { applyCapTableVisibilityGate } = await import('@/lib/dal/cap-table');
    const ct = { id: 'ct', status: 'draft' as const };
    const result = applyCapTableVisibilityGate(ct, {
      isAdmin: false,
      role: 'view_only',
      shadowSide: 'buyer',
      cisAdvisorySide: 'seller_side',
    });
    expect(result).toEqual({ visible: false });
  });
});

describe('deleteCapTable', () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockReset();
    vi.mocked(setCanonicalItemStatus).mockReset();
  });

  it('rejects non-admin sessions', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      userId: 'u1', userEmail: 'u@u', isAdmin: false,
    } as any);
    const { deleteCapTable } = await import('@/lib/dal/cap-table');
    await expect(deleteCapTable('ws-1')).rejects.toThrow('Admin required');
  });
});
