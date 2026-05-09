import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));

import { verifySession } from '@/lib/dal/index';

describe('ai-analyses DAL — auth gates', () => {
  beforeEach(() => vi.mocked(verifySession).mockReset());

  it('enqueueAnalysis throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);
    const { enqueueAnalysis } = await import('@/lib/dal/ai-analyses');
    await expect(enqueueAnalysis({
      workspaceId: 'w', fileId: 'f', fileVersion: 1,
      trigger: 'manual', checklistItemId: null,
    })).rejects.toThrow('Unauthorized');
  });

  it('publishAnalysis throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);
    const { publishAnalysis } = await import('@/lib/dal/ai-analyses');
    await expect(publishAnalysis('a-id')).rejects.toThrow('Unauthorized');
  });

  it('unpublishAnalysis throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);
    const { unpublishAnalysis } = await import('@/lib/dal/ai-analyses');
    await expect(unpublishAnalysis('a-id')).rejects.toThrow('Unauthorized');
  });
});
