import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

describe('deriveIsOverdue()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it('true when requestedBy is past and not approved', async () => {
    vi.doMock('@/db', () => ({ db: {} }));
    vi.doMock('@/db/schema', () => ({}));
    const { deriveIsOverdue } = await import('./qna');
    const now = new Date('2026-06-22');
    expect(deriveIsOverdue('2026-06-13', 'answered', now)).toBe(true);
    expect(deriveIsOverdue('2026-06-13', 'approved', now)).toBe(false); // approved never overdue
    expect(deriveIsOverdue('2026-06-30', 'answered', now)).toBe(false); // future
    expect(deriveIsOverdue(null, 'new', now)).toBe(false);              // no date
  });
});

describe('createQuestion()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('inserts question in transaction and logs qna_asked', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));

    // insert chain: .values().returning() → [{ id: 'q1' }]
    const returning = vi.fn().mockResolvedValue([{ id: 'q1' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { transaction } }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: { id: 'id' },
      qnaQuestionWorkstreams: {},
      qnaRecipients: {},
      workstreams: {},
      users: {},
    }));

    const { createQuestion } = await import('./qna');
    const result = await createQuestion({
      workspaceId: 'ws-1',
      title: 'What is the ARR?',
      workstreamIds: [],
      assigneeId: null,
      requestedBy: null,
      visibility: 'public',
      recipientParticipantIds: [],
      linkedDocId: null,
    });

    expect(result).toEqual({ id: 'q1' });
    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_asked', targetType: 'qna_question' }),
    );
  });
});
