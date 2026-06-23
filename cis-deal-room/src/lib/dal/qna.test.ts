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

    // Role-check select (outside tx): returns participant role
    const roleLimit = vi.fn().mockResolvedValue([{ role: 'participant' }]);
    const roleWhere = vi.fn().mockReturnValue({ limit: roleLimit });
    const roleFrom = vi.fn().mockReturnValue({ where: roleWhere });
    const outerSelect = vi.fn().mockReturnValue({ from: roleFrom });

    // insert chain: .values().returning() → [{ id: 'q1' }]
    const returning = vi.fn().mockResolvedValue([{ id: 'q1' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const transaction = vi.fn(async (cb) => cb(tx));
    vi.doMock('@/db', () => ({ db: { select: outerSelect, transaction } }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: { id: 'id' },
      qnaQuestionWorkstreams: {},
      qnaRecipients: {},
      workstreams: {},
      users: {},
      workspaceParticipants: { id: 'id', userId: 'userId', workspaceId: 'workspaceId', role: 'role', status: 'status' },
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

describe('applyApprovalAction()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  function makeApprovalMocks(session: object | null) {
    const mockSchema = {
      qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
      qnaMessages: { id: 'id' },
      qnaMessageFiles: {},
      qnaQuestionWorkstreams: {},
      qnaRecipients: {},
      workstreams: {},
      users: {},
      files: {},
      workspaceParticipants: {},
    };

    const returning = vi.fn().mockResolvedValue([{ id: 'q-1' }]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const updateCall = vi.fn().mockReturnValue({ set: updateSet });

    const tx = {
      update: updateCall,
    };
    const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
    const db = { transaction };

    return { tx, db, mockSchema, updateSet, returning };
  }

  it('(a) non-admin session (helper→false) → throws "Forbidden"', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(false) }));

    const { tx, db, mockSchema } = makeApprovalMocks({ userId: 'user-1', isAdmin: false });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { applyApprovalAction } = await import('./qna');
    await expect(applyApprovalAction({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      action: 'approve',
    })).rejects.toThrow('Forbidden');
  });

  it('(a2) cis_team non-global-admin (helper→true) → approves successfully', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'cis-1', isAdmin: false, sessionId: 's', userEmail: 'cis@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema, updateSet } = makeApprovalMocks({ userId: 'cis-1', isAdmin: false });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { applyApprovalAction } = await import('./qna');
    await applyApprovalAction({ workspaceId: 'ws-1', questionId: 'q-1', action: 'approve' });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'qna_approved' }));
  });

  it('(b) approve → status "approved" + logActivity "qna_approved"', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'admin@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema, updateSet } = makeApprovalMocks({ userId: 'admin-1', isAdmin: true });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { applyApprovalAction } = await import('./qna');
    await applyApprovalAction({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      action: 'approve',
    });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_approved', targetType: 'qna_question', targetId: 'q-1' }),
    );
  });

  it('(c) reroute with newAssigneeId → sets assigneeId + status "assigned" + logActivity "qna_rerouted"', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'admin@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema, updateSet } = makeApprovalMocks({ userId: 'admin-1', isAdmin: true });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { applyApprovalAction } = await import('./qna');
    await applyApprovalAction({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      action: 'reroute',
      newAssigneeId: 'user-99',
    });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'assigned', assigneeId: 'user-99' }));
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_rerouted', targetType: 'qna_question', targetId: 'q-1' }),
    );
  });

  it('(d) request_changes → status "assigned" + logActivity "qna_changes_requested"', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'admin@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema, updateSet } = makeApprovalMocks({ userId: 'admin-1', isAdmin: true });
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { applyApprovalAction } = await import('./qna');
    await applyApprovalAction({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      action: 'request_changes',
    });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'assigned' }));
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_changes_requested', targetType: 'qna_question', targetId: 'q-1' }),
    );
  });
});

describe('createQuestion() — view_only gate', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  const mockSchema = {
    qnaQuestions: { id: 'id' },
    qnaQuestionWorkstreams: {},
    qnaRecipients: {},
    workstreams: {},
    users: {},
    files: {},
    workspaceParticipants: { id: 'id', userId: 'userId', workspaceId: 'workspaceId', role: 'role', status: 'status' },
  };

  function makeDbWithRole(role: string | null) {
    // db.select() outside transaction: participant role lookup → [{ role }] or []
    const limit = vi.fn().mockResolvedValue(role !== null ? [{ role }] : []);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectCall = vi.fn().mockReturnValue({ from: selectFrom });

    // transaction / insert chain (only reached when not forbidden)
    const returning = vi.fn().mockResolvedValue([{ id: 'q1' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

    const db = { select: selectCall, transaction };
    return { db, tx };
  }

  it('view_only caller → throws Forbidden, no insert', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-vo', isAdmin: false, sessionId: 's', userEmail: 'vo@test.com' }),
    }));
    const { db } = makeDbWithRole('view_only');
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { createQuestion } = await import('./qna');
    await expect(createQuestion({
      workspaceId: 'ws-1',
      title: 'Can I ask?',
      workstreamIds: [],
      assigneeId: null,
      requestedBy: null,
      visibility: 'public',
      recipientParticipantIds: [],
      linkedDocId: null,
    })).rejects.toThrow('Forbidden');
  });

  it('isAdmin=true skips role check → proceeds even with view_only row', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'admin-1', isAdmin: true, sessionId: 's', userEmail: 'admin@cis.com' }),
    }));
    // Even if role row exists as view_only, admin bypasses lookup
    const { db, tx } = makeDbWithRole('view_only');
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { createQuestion } = await import('./qna');
    const result = await createQuestion({
      workspaceId: 'ws-1',
      title: 'Admin asks',
      workstreamIds: [],
      assigneeId: null,
      requestedBy: null,
      visibility: 'public',
      recipientParticipantIds: [],
      linkedDocId: null,
    });
    expect(result).toEqual({ id: 'q1' });
    expect(tx.insert).toHaveBeenCalled();
  });

  it('no participant row (role lookup returns []) → throws Forbidden, no insert', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-ghost', isAdmin: false, sessionId: 's', userEmail: 'ghost@test.com' }),
    }));
    const { db } = makeDbWithRole(null); // returns []
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { createQuestion } = await import('./qna');
    await expect(createQuestion({
      workspaceId: 'ws-1',
      title: 'Ghost asks',
      workstreamIds: [],
      assigneeId: null,
      requestedBy: null,
      visibility: 'public',
      recipientParticipantIds: [],
      linkedDocId: null,
    })).rejects.toThrow(/forbidden/i);
  });

  it('non-view_only role (e.g. participant) → proceeds', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@test.com' }),
    }));
    const { db, tx } = makeDbWithRole('participant');
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { createQuestion } = await import('./qna');
    const result = await createQuestion({
      workspaceId: 'ws-1',
      title: 'Normal ask',
      workstreamIds: [],
      assigneeId: null,
      requestedBy: null,
      visibility: 'public',
      recipientParticipantIds: [],
      linkedDocId: null,
    });
    expect(result).toEqual({ id: 'q1' });
    expect(tx.insert).toHaveBeenCalled();
  });
});

describe('postMessage()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  const mockSchema = {
    qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
    qnaMessages: { id: 'id' },
    qnaMessageFiles: {},
    qnaQuestionWorkstreams: {},
    qnaRecipients: {},
    workstreams: {},
    users: {},
    files: {},
    workspaceParticipants: { id: 'id', userId: 'userId', workspaceId: 'workspaceId', role: 'role', status: 'status' },
  };

  function makePostMessageTx(selectResult: Array<{ id: string }>, callerRole = 'participant') {
    // First db.select() is the role-check (outside tx), returning [{ role }] or []
    const roleLimit = vi.fn().mockResolvedValue(callerRole !== '__skip__' ? [{ role: callerRole }] : []);
    const roleWhere = vi.fn().mockReturnValue({ limit: roleLimit });
    const roleFrom = vi.fn().mockReturnValue({ where: roleWhere });
    const outerSelect = vi.fn().mockReturnValue({ from: roleFrom });

    // select chain inside tx: .from().where().limit() → selectResult
    const limit = vi.fn().mockResolvedValue(selectResult);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const txSelect = vi.fn().mockReturnValue({ from: selectFrom });

    // insert chain: .values().returning() → [{ id: 'msg-new' }]
    const returning = vi.fn().mockResolvedValue([{ id: 'msg-new' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });

    const tx: Record<string, ReturnType<typeof vi.fn>> = {
      select: txSelect,
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
    const db = { select: outerSelect, transaction };
    return { tx, db };
  }

  it('view_only caller → throws Forbidden before entering tx', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-vo', isAdmin: false, sessionId: 's', userEmail: 'vo@test.com' }),
    }));
    const { tx, db } = makePostMessageTx([{ id: 'q1' }], 'view_only');
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { postMessage } = await import('./qna');
    await expect(postMessage('ws-1', 'q1', 'Hello')).rejects.toThrow('Forbidden');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('no participant row (role lookup returns []) → throws Forbidden, no insert', async () => {
    vi.doMock('./activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-ghost', isAdmin: false, sessionId: 's', userEmail: 'ghost@test.com' }),
    }));
    // '__skip__' sentinel → roleLimit returns []
    const { tx, db } = makePostMessageTx([{ id: 'q1' }], '__skip__');
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { postMessage } = await import('./qna');
    await expect(postMessage('ws-1', 'q1', 'Hello')).rejects.toThrow(/forbidden/i);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('happy path: question in workspace → inserts message + logs qna_message_posted', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));
    const { tx, db } = makePostMessageTx([{ id: 'q1' }]);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { postMessage } = await import('./qna');
    const result = await postMessage('ws-1', 'q1', 'Hello there');

    expect(result).toEqual({ id: 'msg-new' });
    expect(tx.select).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'qna_message_posted', targetType: 'qna_question', targetId: 'q1' }),
    );
  });

  it('question not in workspace → rejects with /not found/i, no insert', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));
    const { tx, db } = makePostMessageTx([]);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { postMessage } = await import('./qna');
    await expect(postMessage('ws-1', 'q-other-ws', 'Hello')).rejects.toThrow(/not found/i);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe('submitProposedAnswer()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  function makeSubmitMocks(logActivity: ReturnType<typeof vi.fn>, selectResult: Array<{ id: string; assigneeId: string | null }> = [{ id: 'q-1', assigneeId: null }]) {
    const mockSchema = {
      qnaQuestions: { id: 'id', workspaceId: 'workspaceId' },
      qnaMessages: { id: 'id' },
      qnaMessageFiles: {},
      qnaQuestionWorkstreams: {},
      qnaRecipients: {},
      workstreams: {},
      users: {},
      files: {},
      workspaceParticipants: {},
    };

    // select chain for workspace authz check: .from().where().limit() → selectResult
    const limit = vi.fn().mockResolvedValue(selectResult);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const selectCall = vi.fn().mockReturnValue({ from: selectFrom });

    const returning = vi.fn().mockResolvedValue([{ id: 'msg-new' }]);
    const insertValues = vi.fn().mockReturnValue({ returning });

    // update chain: .set().where()
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const updateCall = vi.fn().mockReturnValue({ set: updateSet });

    const tx: Record<string, ReturnType<typeof vi.fn>> = {
      select: selectCall,
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
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

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

  it('question not in workspace → rejects with /not found/i, no insert', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-1', isAdmin: false, sessionId: 's', userEmail: 'u@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema } = makeSubmitMocks(logActivity, []);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { submitProposedAnswer } = await import('./qna');
    await expect(submitProposedAnswer({
      workspaceId: 'ws-1',
      questionId: 'q-other-ws',
      body: 'Answer.',
      attachmentFileIds: [],
      cisAdvisorySide: 'seller_side',
    })).rejects.toThrow(/not found/i);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('non-cis non-assignee (helper→false, different assigneeId) → rejects with /forbidden/i, no insert', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'user-x', isAdmin: false, sessionId: 's', userEmail: 'x@other.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(false) }));

    // Question is assigned to 'other-user', not 'user-x'
    const { tx, db, mockSchema } = makeSubmitMocks(logActivity, [{ id: 'q-1', assigneeId: 'other-user' }]);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { submitProposedAnswer } = await import('./qna');
    await expect(submitProposedAnswer({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      body: 'Unauthorized answer.',
      attachmentFileIds: [],
      cisAdvisorySide: 'seller_side',
    })).rejects.toThrow(/forbidden/i);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('cis_team non-global-admin (helper→true): submits proposed answer successfully', async () => {
    const logActivity = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./activity', () => ({ logActivity }));
    vi.doMock('./index', () => ({
      verifySession: vi.fn().mockResolvedValue({ userId: 'cis-1', isAdmin: false, sessionId: 's', userEmail: 'cis@cis.com' }),
    }));
    vi.doMock('./access', () => ({ isCisTeamOrAdmin: vi.fn().mockResolvedValue(true) }));

    const { tx, db, mockSchema, updateSet } = makeSubmitMocks(logActivity);
    vi.doMock('@/db', () => ({ db }));
    vi.doMock('@/db/schema', () => mockSchema);

    const { submitProposedAnswer } = await import('./qna');
    await submitProposedAnswer({
      workspaceId: 'ws-1',
      questionId: 'q-1',
      body: 'CIS team answer.',
      attachmentFileIds: [],
      cisAdvisorySide: 'seller_side',
    });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'answered' }));
    expect(logActivity).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'qna_answered' }));
  });
});
