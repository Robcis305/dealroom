import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend, mockInsert, mockSelect } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({ id: 'x' });
  const mockInsert = vi.fn().mockResolvedValue(undefined);
  const mockSelect = vi.fn();
  return { mockSend, mockInsert, mockSelect };
});

vi.mock('@/lib/email/send', () => ({ sendEmail: mockSend }));

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockSelect }) }) }),
    insert: () => ({ values: (x: unknown) => mockInsert(x) }),
  },
}));

import { enqueueOrSend } from './enqueue-or-send';

beforeEach(() => vi.clearAllMocks());

describe('enqueueOrSend channel routing', () => {
  const base = {
    userId: 'u1', workspaceId: 'w1', action: 'uploaded' as const,
    targetType: 'file' as const, targetId: 't1', metadata: {},
    immediateEmail: async () => ({ to: 'u@x.com', subject: 's', react: null as any }),
  };

  it('skips the send entirely when the channel is disabled', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: false, notifyDigest: false }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('sends immediately when digest is off and channel is enabled', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: true, notifyDigest: false }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('enqueues when the user prefers digest', async () => {
    mockSelect.mockResolvedValueOnce([{ notifyUploads: true, notifyDigest: true }]);
    await enqueueOrSend({ ...base, channel: 'uploads' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
