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

  it('qna channel is NOT muted by notifyUploads=false and sends immediately when digest off', async () => {
    vi.resetModules();
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/email/send', () => ({ sendEmail }));
    vi.doMock('@/db', () => ({
      db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ notifyUploads: false, notifyDigest: false }] }) }) }),
        insert: () => ({ values: vi.fn() }),
      },
    }));
    vi.doMock('@/db/schema', () => ({ notificationQueue: {}, users: {} }));
    const { enqueueOrSend } = await import('./enqueue-or-send');
    await enqueueOrSend({
      userId: 'u1', workspaceId: 'w1', action: 'qna_approved', targetType: 'qna_question',
      targetId: 'q1', metadata: {}, channel: 'qna',
      immediateEmail: async () => ({ to: 'a@b.com', subject: 's', react: {} as never }),
    });
    expect(sendEmail).toHaveBeenCalledTimes(1); // not muted, delivered immediately
  });
});
