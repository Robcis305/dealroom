import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// enqueueQnaApprovedNotification
// ---------------------------------------------------------------------------
describe('enqueueQnaApprovedNotification()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('emails the asker with action qna_approved on the qna channel', async () => {
    const enqueueOrSend = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./enqueue-or-send', () => ({ enqueueOrSend }));

    // 1st select: question (title, askedById, workspaceName); 2nd select: asker email
    const question = [{ title: 'Revenue bridge?', askedById: 'asker-1', assigneeId: null, workspaceName: 'Project Falcon' }];
    const asker = [{ id: 'asker-1', email: 'asker@x.com', firstName: 'L', lastName: 'B' }];
    let call = 0;

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn(() => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => (call++ === 0 ? question : asker),
              }),
            }),
            where: () => ({
              limit: async () => (call++ === 0 ? question : asker),
            }),
          }),
        })),
      },
    }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: {}, workspaces: {}, users: {}, workspaceParticipants: {},
    }));

    const { enqueueQnaApprovedNotification } = await import('./enqueue-qna-notifications');
    await enqueueQnaApprovedNotification({ workspaceId: 'w1', questionId: 'q1' });

    expect(enqueueOrSend).toHaveBeenCalledOnce();
    expect(enqueueOrSend).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'asker-1',
      action: 'qna_approved',
      targetType: 'qna_question',
      targetId: 'q1',
      channel: 'qna',
    }));
  });
});

// ---------------------------------------------------------------------------
// enqueueQnaAssignedNotification
// ---------------------------------------------------------------------------
describe('enqueueQnaAssignedNotification()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('emails the assignee with action qna_assigned on the qna channel', async () => {
    const enqueueOrSend = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./enqueue-or-send', () => ({ enqueueOrSend }));

    const question = [{ title: 'Margin analysis?', askedById: 'asker-2', assigneeId: 'assignee-1', workspaceName: 'Project Condor' }];
    const assignee = [{ id: 'assignee-1', email: 'assignee@x.com', firstName: 'A', lastName: 'Z' }];
    let call = 0;

    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn(() => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => (call++ === 0 ? question : assignee),
              }),
            }),
            where: () => ({
              limit: async () => (call++ === 0 ? question : assignee),
            }),
          }),
        })),
      },
    }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: {}, workspaces: {}, users: {}, workspaceParticipants: {},
    }));

    const { enqueueQnaAssignedNotification } = await import('./enqueue-qna-notifications');
    await enqueueQnaAssignedNotification({ workspaceId: 'w1', questionId: 'q1', assigneeUserId: 'assignee-1' });

    expect(enqueueOrSend).toHaveBeenCalledOnce();
    expect(enqueueOrSend).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'assignee-1',
      action: 'qna_assigned',
      targetType: 'qna_question',
      targetId: 'q1',
      channel: 'qna',
    }));
  });
});

// ---------------------------------------------------------------------------
// enqueueQnaAnswerSubmittedNotification
// ---------------------------------------------------------------------------
describe('enqueueQnaAnswerSubmittedNotification()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('emails all CIS reviewers with action qna_answered on the qna channel', async () => {
    const enqueueOrSend = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./enqueue-or-send', () => ({ enqueueOrSend }));

    const question = [{ title: 'Capex forecast?', askedById: 'asker-3', assigneeId: null, workspaceName: 'Project Eagle' }];
    const reviewers = [
      { id: 'cis-1', email: 'cis1@x.com', firstName: 'C', lastName: 'One' },
      { id: 'cis-2', email: 'cis2@x.com', firstName: 'C', lastName: 'Two' },
    ];

    // The reviewers query uses innerJoin().where() without .limit() — need a
    // thenable so await resolves to the reviewers array.
    // Re-mock with call counter to distinguish the two innerJoin chains.
    vi.resetModules();
    vi.clearAllMocks();
    const enqueueOrSend2 = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./enqueue-or-send', () => ({ enqueueOrSend: enqueueOrSend2 }));

    let selectCall = 0;
    vi.doMock('@/db', () => ({
      db: {
        select: vi.fn(() => {
          const callIndex = selectCall++;
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => {
                  if (callIndex === 0) {
                    // loadQuestionContext: innerJoin().where().limit()
                    return {
                      limit: async () => question,
                    };
                  }
                  // reviewers query: innerJoin().where() — directly awaitable
                  return Promise.resolve(reviewers);
                },
              }),
              where: () => ({
                limit: async () => question,
              }),
            }),
          };
        }),
      },
    }));
    vi.doMock('@/db/schema', () => ({
      qnaQuestions: {}, workspaces: {}, users: {}, workspaceParticipants: {},
    }));

    const { enqueueQnaAnswerSubmittedNotification } = await import('./enqueue-qna-notifications');
    await enqueueQnaAnswerSubmittedNotification({ workspaceId: 'w1', questionId: 'q1' });

    expect(enqueueOrSend2).toHaveBeenCalledTimes(2);
    expect(enqueueOrSend2).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'cis-1',
      action: 'qna_answered',
      targetType: 'qna_question',
      targetId: 'q1',
      channel: 'qna',
    }));
    expect(enqueueOrSend2).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'cis-2',
      action: 'qna_answered',
      targetType: 'qna_question',
      targetId: 'q1',
      channel: 'qna',
    }));
  });
});
