import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./index', () => ({ verifySession: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
// drizzle-orm is used implicitly via the mocked db

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

describe('getQuestionDetail()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  // The test questions all have assigneeId: null so the assignee query is skipped.
  // Query order (no assignee): question, workstreams, messages, attachments, recipients
  const MESSAGE_RESULT = [
    {
      id: 'msg-1', questionId: 'q1', authorId: 'user-1',
      authorFirst: 'Alice', authorLast: 'Smith', authorEmail: 'alice@cis.com',
      kind: 'message', body: 'Thread message body', createdAt: new Date('2026-06-01T10:00:00Z'),
    },
    {
      id: 'msg-2', questionId: 'q1', authorId: 'user-2',
      authorFirst: 'Bob', authorLast: null, authorEmail: 'bob@cis.com',
      kind: 'proposed_answer', body: 'Proposed answer body', createdAt: new Date('2026-06-02T10:00:00Z'),
    },
  ];

  function makeDb(questionRow: object | null) {
    const questionResult = questionRow ? [questionRow] : [];
    const workstreamsResult = [{ questionId: 'q1', id: 'ws-1', name: 'Finance', color: '#blue' }];
    const filesResult = [{ messageId: 'msg-1', fileId: 'file-1', fileName: 'attachment.pdf' }];
    const recipientsResult = [
      { participantId: 'part-1', firstName: 'Carol', lastName: 'Jones', email: 'carol@cis.com' },
    ];

    // With assigneeId null, order is: question(0), workstreams(1), messages(2), attachments(3), recipients(4)
    const results = [
      questionResult,
      workstreamsResult,
      MESSAGE_RESULT,
      filesResult,
      recipientsResult,
    ];

    let callCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        const result = results[callCount] ?? [];
        callCount++;
        // Build a fluent chain that resolves when awaited or when .orderBy()/.where() is the terminal call
        function makeChain(r: unknown[]) {
          const p = Promise.resolve(r);
          const chain: Record<string, unknown> = {
            then: p.then.bind(p),
            catch: p.catch.bind(p),
            finally: p.finally.bind(p),
          };
          chain.from = vi.fn().mockReturnValue(chain);
          chain.innerJoin = vi.fn().mockReturnValue(chain);
          chain.leftJoin = vi.fn().mockReturnValue(chain);
          chain.where = vi.fn().mockReturnValue(chain);
          chain.orderBy = vi.fn().mockResolvedValue(r);
          return chain;
        }
        return makeChain(result);
      }),
    };
    return db;
  }

  it('returns thread (kind=message), proposedAnswer (kind=proposed_answer), and approvalGateActive for seller_side+answered', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn() }));
    vi.doMock('./activity', () => ({ logActivity: vi.fn() }));

    const questionRow = {
      id: 'q1', workspaceId: 'ws-1', title: 'What is ARR?',
      status: 'answered', askedById: 'user-1',
      askedFirst: 'Alice', askedLast: 'Smith', askedEmail: 'alice@cis.com',
      assigneeId: null,
      askedAt: new Date('2026-05-01T00:00:00Z'),
      requestedBy: new Date('2026-06-01T00:00:00Z'),
      visibility: 'public', linkedDocId: null,
    };

    const db = makeDb(questionRow);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
      qnaQuestionWorkstreams: { questionId: 'questionId', workstreamId: 'workstreamId' },
      qnaRecipients: { questionId: 'questionId', participantId: 'participantId' },
      qnaMessages: { id: 'id', questionId: 'questionId', authorId: 'authorId', kind: 'kind', createdAt: 'createdAt' },
      qnaMessageFiles: { messageId: 'messageId', fileId: 'fileId' },
      workspaceParticipants: { id: 'id', userId: 'userId' },
      workstreams: { id: 'id', name: 'name', color: 'color' },
      users: { id: 'id', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      files: { id: 'id', name: 'name' },
    }));

    const { getQuestionDetail } = await import('./qna');
    const now = new Date('2026-06-22');

    // seller_side + answered → approvalGateActive = true
    const detail = await getQuestionDetail('ws-1', 'q1', 'seller_side', now);

    expect(detail).not.toBeNull();
    expect(detail!.thread).toHaveLength(1);
    expect(detail!.thread[0].id).toBe('msg-1');
    expect(detail!.thread[0].kind).toBe('message');
    expect(detail!.proposedAnswer).not.toBeNull();
    expect(detail!.proposedAnswer!.id).toBe('msg-2');
    expect(detail!.proposedAnswer!.kind).toBe('proposed_answer');
    expect(detail!.approvalGateActive).toBe(true);
  });

  it('returns approvalGateActive=false for buyer_side even when answered', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn() }));
    vi.doMock('./activity', () => ({ logActivity: vi.fn() }));

    const questionRow = {
      id: 'q1', workspaceId: 'ws-1', title: 'What is ARR?',
      status: 'answered', askedById: 'user-1',
      askedFirst: 'Alice', askedLast: 'Smith', askedEmail: 'alice@cis.com',
      assigneeId: null,
      askedAt: new Date('2026-05-01T00:00:00Z'),
      requestedBy: null,
      visibility: 'public', linkedDocId: null,
    };

    const db = makeDb(questionRow);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
      qnaQuestionWorkstreams: { questionId: 'questionId', workstreamId: 'workstreamId' },
      qnaRecipients: { questionId: 'questionId', participantId: 'participantId' },
      qnaMessages: { id: 'id', questionId: 'questionId', authorId: 'authorId', kind: 'kind', createdAt: 'createdAt' },
      qnaMessageFiles: { messageId: 'messageId', fileId: 'fileId' },
      workspaceParticipants: { id: 'id', userId: 'userId' },
      workstreams: { id: 'id', name: 'name', color: 'color' },
      users: { id: 'id', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      files: { id: 'id', name: 'name' },
    }));

    const { getQuestionDetail } = await import('./qna');
    const now = new Date('2026-06-22');

    const detail = await getQuestionDetail('ws-1', 'q1', 'buyer_side', now);
    expect(detail).not.toBeNull();
    expect(detail!.approvalGateActive).toBe(false);
  });

  it('returns null when question not found in workspace', async () => {
    vi.doMock('./index', () => ({ verifySession: vi.fn() }));
    vi.doMock('./activity', () => ({ logActivity: vi.fn() }));

    const db = makeDb(null);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
      qnaQuestionWorkstreams: { questionId: 'questionId', workstreamId: 'workstreamId' },
      qnaRecipients: { questionId: 'questionId', participantId: 'participantId' },
      qnaMessages: { id: 'id', questionId: 'questionId', authorId: 'authorId', kind: 'kind', createdAt: 'createdAt' },
      qnaMessageFiles: { messageId: 'messageId', fileId: 'fileId' },
      workspaceParticipants: { id: 'id', userId: 'userId' },
      workstreams: { id: 'id', name: 'name', color: 'color' },
      users: { id: 'id', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      files: { id: 'id', name: 'name' },
    }));

    const { getQuestionDetail } = await import('./qna');
    const now = new Date('2026-06-22');

    const detail = await getQuestionDetail('ws-1', 'q-missing', 'seller_side', now);
    expect(detail).toBeNull();
  });
});

describe('submitProposedAnswer()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  function makeSubmitMocks(logActivity: ReturnType<typeof vi.fn>) {
    const mockSchema = {
      qnaQuestions: { id: 'id' },
      qnaMessages: { id: 'id' },
      qnaMessageFiles: {},
      qnaQuestionWorkstreams: {},
      qnaRecipients: {},
      workstreams: {},
      users: {},
      files: {},
      workspaceParticipants: {},
    };

    const returning = vi.fn().mockResolvedValue([{ id: 'msg-new' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });

    // update chain: .set().where()
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const updateCall = vi.fn().mockReturnValue({ set: updateSet });

    const tx: Record<string, ReturnType<typeof vi.fn>> = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: updateCall,
    };
    const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
    const db = { transaction };

    return { tx, transaction, db, mockSchema, updateSet };
  }

  it('seller_side: sets status to "answered", logs qna_answered but NOT qna_approved', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));

    const { tx, db, mockSchema, updateSet } = makeSubmitMocks(logActivity);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { submitProposedAnswer } = await import('./qna');
    await submitProposedAnswer({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      body: 'Here is the answer.',
      attachmentFileIds: [],
      cisAdvisorySide: 'seller_side',
    });

    // Status must be 'answered'
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'answered' }));

    // logActivity called with 'qna_answered'
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_answered', targetType: 'qna_question', targetId: 'q-1' }),
    );

    // logActivity must NOT be called with 'qna_approved'
    const approvedCall = logActivity.mock.calls.find(
      (args: unknown[]) => (args[1] as { action: string })?.action === 'qna_approved',
    );
    expect(approvedCall).toBeUndefined();
  });

  it('buyer_side: sets status to "approved", logs both qna_answered and qna_approved (auto:true)', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));

    const { tx, db, mockSchema, updateSet } = makeSubmitMocks(logActivity);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { submitProposedAnswer } = await import('./qna');
    await submitProposedAnswer({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      body: 'Buy-side answer.',
      attachmentFileIds: ['file-a', 'file-b'],
      cisAdvisorySide: 'buyer_side',
    });

    // Status must be 'approved'
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));

    // logActivity called with 'qna_answered'
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_answered', targetType: 'qna_question', targetId: 'q-1' }),
    );

    // logActivity also called with 'qna_approved' and metadata { auto: true }
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_approved', targetType: 'qna_question', targetId: 'q-1', metadata: { auto: true } }),
    );
  });
});
