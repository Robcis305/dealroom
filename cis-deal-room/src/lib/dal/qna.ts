import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  qnaQuestions, qnaQuestionWorkstreams, qnaRecipients,
  qnaMessages, qnaMessageFiles,
  workspaceParticipants, workstreams, users, files,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import { isCisTeamOrAdmin } from './access';
import type { QnaStatus, QnaVisibility, QnaQuestionRow, QnaQuestionDetail } from '@/types';

export function nameOfUser(f: string | null, l: string | null, e: string): string {
  return [f, l].filter(Boolean).join(' ') || e;
}

export function deriveIsOverdue(requestedBy: string | Date | null, status: QnaStatus, now: Date): boolean {
  if (requestedBy == null) return false;
  if (status === 'approved') return false;
  return new Date(requestedBy) < now;
}

export async function createQuestion(input: {
  workspaceId: string;
  title: string;
  workstreamIds: string[];
  assigneeId: string | null;
  requestedBy: string | null;
  visibility: QnaVisibility;
  recipientParticipantIds: string[];
  linkedDocId: string | null;
}): Promise<{ id: string }> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (!session.isAdmin) {
    const [pRow] = await db
      .select({ role: workspaceParticipants.role })
      .from(workspaceParticipants)
      .where(and(
        eq(workspaceParticipants.workspaceId, input.workspaceId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active'),
      ))
      .limit(1);
    if (!pRow || pRow.role === 'view_only') throw new Error('Forbidden');
  }

  return db.transaction(async (tx) => {
    const [q] = await tx.insert(qnaQuestions).values({
      workspaceId: input.workspaceId,
      title: input.title,
      status: 'new',
      askedById: session.userId,
      assigneeId: input.assigneeId,
      requestedBy: input.requestedBy,
      visibility: input.visibility,
      linkedDocId: input.linkedDocId,
    }).returning({ id: qnaQuestions.id });

    if (input.workstreamIds.length > 0) {
      await tx.insert(qnaQuestionWorkstreams).values(
        input.workstreamIds.map((workstreamId) => ({ questionId: q.id, workstreamId })),
      );
    }
    if (input.visibility === 'private' && input.recipientParticipantIds.length > 0) {
      await tx.insert(qnaRecipients).values(
        input.recipientParticipantIds.map((participantId) => ({ questionId: q.id, participantId })),
      );
    }

    await logActivity(tx, {
      workspaceId: input.workspaceId,
      userId: session.userId,
      action: 'qna_asked',
      targetType: 'qna_question',
      targetId: q.id,
      metadata: { title: input.title, visibility: input.visibility },
    });
    return { id: q.id };
  });
}

export async function listQuestions(workspaceId: string, now: Date): Promise<QnaQuestionRow[]> {
  const rows = await db
    .select({
      id: qnaQuestions.id,
      workspaceId: qnaQuestions.workspaceId,
      title: qnaQuestions.title,
      status: qnaQuestions.status,
      askedById: qnaQuestions.askedById,
      askedFirst: users.firstName,
      askedLast: users.lastName,
      askedEmail: users.email,
      assigneeId: qnaQuestions.assigneeId,
      askedAt: qnaQuestions.askedAt,
      requestedBy: qnaQuestions.requestedBy,
      visibility: qnaQuestions.visibility,
      linkedDocId: qnaQuestions.linkedDocId,
    })
    .from(qnaQuestions)
    .innerJoin(users, eq(users.id, qnaQuestions.askedById))
    .where(eq(qnaQuestions.workspaceId, workspaceId))
    .orderBy(desc(qnaQuestions.askedAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const tags = await db
    .select({
      questionId: qnaQuestionWorkstreams.questionId,
      id: workstreams.id, name: workstreams.name, color: workstreams.color,
    })
    .from(qnaQuestionWorkstreams)
    .innerJoin(workstreams, eq(workstreams.id, qnaQuestionWorkstreams.workstreamId))
    .where(inArray(qnaQuestionWorkstreams.questionId, ids));

  const assigneeIds = rows.map((r) => r.assigneeId).filter((x): x is string => !!x);
  const assignees = assigneeIds.length
    ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users).where(inArray(users.id, assigneeIds))
    : [];
  const nameOf = nameOfUser;
  const assigneeMap = new Map(assignees.map((a) => [a.id, nameOf(a.firstName, a.lastName, a.email)]));
  const tagMap = new Map<string, Array<{ id: string; name: string; color: string }>>();
  for (const t of tags) {
    const list = tagMap.get(t.questionId) ?? [];
    list.push({ id: t.id, name: t.name, color: t.color });
    tagMap.set(t.questionId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    title: r.title,
    status: r.status,
    askedById: r.askedById,
    askedByName: nameOf(r.askedFirst, r.askedLast, r.askedEmail),
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeId ? assigneeMap.get(r.assigneeId) ?? null : null,
    askedAt: String(r.askedAt),
    requestedBy: r.requestedBy ? String(r.requestedBy) : null,
    visibility: r.visibility,
    linkedDocId: r.linkedDocId,
    workstreams: tagMap.get(r.id) ?? [],
    isOverdue: deriveIsOverdue(r.requestedBy, r.status, now),
  }));
}

export async function getQuestionDetail(
  workspaceId: string,
  questionId: string,
  cisAdvisorySide: 'buyer_side' | 'seller_side',
  now: Date,
): Promise<QnaQuestionDetail | null> {
  // 1. Fetch the question row (with asker user join)
  const questionRows = await db
    .select({
      id: qnaQuestions.id,
      workspaceId: qnaQuestions.workspaceId,
      title: qnaQuestions.title,
      status: qnaQuestions.status,
      askedById: qnaQuestions.askedById,
      askedFirst: users.firstName,
      askedLast: users.lastName,
      askedEmail: users.email,
      assigneeId: qnaQuestions.assigneeId,
      askedAt: qnaQuestions.askedAt,
      requestedBy: qnaQuestions.requestedBy,
      visibility: qnaQuestions.visibility,
      linkedDocId: qnaQuestions.linkedDocId,
    })
    .from(qnaQuestions)
    .innerJoin(users, eq(users.id, qnaQuestions.askedById))
    .where(and(eq(qnaQuestions.id, questionId), eq(qnaQuestions.workspaceId, workspaceId)));

  const q = questionRows[0] ?? null;
  if (!q) return null;

  // 2. Fetch workstreams tags
  const tags = await db
    .select({
      questionId: qnaQuestionWorkstreams.questionId,
      id: workstreams.id, name: workstreams.name, color: workstreams.color,
    })
    .from(qnaQuestionWorkstreams)
    .innerJoin(workstreams, eq(workstreams.id, qnaQuestionWorkstreams.workstreamId))
    .where(eq(qnaQuestionWorkstreams.questionId, questionId));

  // 3. Fetch assignee if present
  const assignees = q.assigneeId
    ? await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(eq(users.id, q.assigneeId))
    : [];
  const assigneeMap = new Map(assignees.map((a) => [a.id, nameOfUser(a.firstName, a.lastName, a.email)]));

  // 4. Fetch messages (with author name) ordered oldest-first
  const msgRows = await db
    .select({
      id: qnaMessages.id,
      questionId: qnaMessages.questionId,
      authorId: qnaMessages.authorId,
      authorFirst: users.firstName,
      authorLast: users.lastName,
      authorEmail: users.email,
      kind: qnaMessages.kind,
      body: qnaMessages.body,
      createdAt: qnaMessages.createdAt,
    })
    .from(qnaMessages)
    .innerJoin(users, eq(users.id, qnaMessages.authorId))
    .where(eq(qnaMessages.questionId, questionId))
    .orderBy(asc(qnaMessages.createdAt));

  // 5. Fetch attachments for all messages
  const msgIds = msgRows.map((m) => m.id);
  const attachRows = msgIds.length
    ? await db
        .select({
          messageId: qnaMessageFiles.messageId,
          fileId: qnaMessageFiles.fileId,
          fileName: files.name,
        })
        .from(qnaMessageFiles)
        .innerJoin(files, eq(files.id, qnaMessageFiles.fileId))
        .where(inArray(qnaMessageFiles.messageId, msgIds))
    : [];

  const attachMap = new Map<string, Array<{ fileId: string; name: string }>>();
  for (const a of attachRows) {
    const list = attachMap.get(a.messageId) ?? [];
    list.push({ fileId: a.fileId, name: a.fileName });
    attachMap.set(a.messageId, list);
  }

  // Build message objects
  const allMsgs = msgRows.map((m) => ({
    id: m.id,
    questionId: m.questionId,
    authorId: m.authorId,
    authorName: nameOfUser(m.authorFirst, m.authorLast, m.authorEmail),
    kind: m.kind as 'message' | 'proposed_answer',
    body: m.body,
    createdAt: String(m.createdAt),
    attachments: attachMap.get(m.id) ?? [],
  }));

  const thread = allMsgs.filter((m) => m.kind === 'message');
  const proposedAnswers = allMsgs.filter((m) => m.kind === 'proposed_answer');
  const proposedAnswer = proposedAnswers.length > 0 ? proposedAnswers[proposedAnswers.length - 1] : null;

  // 6. Fetch recipients (qna_recipients → workspace_participants → users)
  const recipientRows = await db
    .select({
      participantId: qnaRecipients.participantId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(qnaRecipients)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, qnaRecipients.participantId))
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(qnaRecipients.questionId, questionId));

  const recipients = recipientRows.map((r) => ({
    participantId: r.participantId,
    name: nameOfUser(r.firstName, r.lastName, r.email),
  }));

  // 7. Resolve linkedDocName
  let linkedDocName: string | null = null;
  if (q.linkedDocId) {
    const docRows = await db
      .select({ name: files.name })
      .from(files)
      .where(eq(files.id, q.linkedDocId));
    linkedDocName = docRows[0]?.name ?? null;
  }

  const tagList = tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  return {
    id: q.id,
    workspaceId: q.workspaceId,
    title: q.title,
    status: q.status,
    askedById: q.askedById,
    askedByName: nameOfUser(q.askedFirst, q.askedLast, q.askedEmail),
    assigneeId: q.assigneeId,
    assigneeName: q.assigneeId ? assigneeMap.get(q.assigneeId) ?? null : null,
    askedAt: String(q.askedAt),
    requestedBy: q.requestedBy ? String(q.requestedBy) : null,
    visibility: q.visibility,
    linkedDocId: q.linkedDocId,
    workstreams: tagList,
    isOverdue: deriveIsOverdue(q.requestedBy, q.status, now),
    thread,
    proposedAnswer,
    recipients,
    linkedDocName,
    approvalGateActive: cisAdvisorySide === 'seller_side' && q.status === 'answered',
  };
}

export async function postMessage(
  workspaceId: string,
  questionId: string,
  body: string,
): Promise<{ id: string }> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (!session.isAdmin) {
    const [pRow] = await db
      .select({ role: workspaceParticipants.role })
      .from(workspaceParticipants)
      .where(and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active'),
      ))
      .limit(1);
    if (!pRow || pRow.role === 'view_only') throw new Error('Forbidden');
  }

  return db.transaction(async (tx) => {
    const [q] = await tx
      .select({ id: qnaQuestions.id })
      .from(qnaQuestions)
      .where(and(eq(qnaQuestions.id, questionId), eq(qnaQuestions.workspaceId, workspaceId)))
      .limit(1);
    if (!q) throw new Error('Question not found');

    const [msg] = await tx.insert(qnaMessages).values({
      questionId,
      authorId: session.userId,
      kind: 'message',
      body,
    }).returning({ id: qnaMessages.id });

    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'qna_message_posted',
      targetType: 'qna_question',
      targetId: questionId,
    });

    return { id: msg.id };
  });
}

export async function applyApprovalAction(input: {
  workspaceId: string;
  questionId: string;
  action: 'approve' | 'request_changes' | 'reroute';
  newAssigneeId?: string | null;
}): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!(await isCisTeamOrAdmin(input.workspaceId, session))) throw new Error('Forbidden');

  await db.transaction(async (tx) => {
    let setPayload: { status: QnaStatus; updatedAt: Date; assigneeId?: string | null };

    if (input.action === 'approve') {
      setPayload = { status: 'approved', updatedAt: new Date() };
    } else if (input.action === 'request_changes') {
      setPayload = { status: 'assigned', updatedAt: new Date() };
    } else {
      setPayload = { status: 'assigned', updatedAt: new Date(), assigneeId: input.newAssigneeId ?? null };
    }

    const rows = await tx
      .update(qnaQuestions)
      .set(setPayload)
      .where(and(eq(qnaQuestions.id, input.questionId), eq(qnaQuestions.workspaceId, input.workspaceId)))
      .returning({ id: qnaQuestions.id });

    if (rows.length === 0) throw new Error('Question not found');

    const actionLog =
      input.action === 'approve'
        ? 'qna_approved'
        : input.action === 'request_changes'
        ? 'qna_changes_requested'
        : 'qna_rerouted';

    await logActivity(tx, {
      workspaceId: input.workspaceId,
      userId: session.userId,
      action: actionLog,
      targetType: 'qna_question',
      targetId: input.questionId,
    });
  });
}

export async function submitProposedAnswer(input: {
  workspaceId: string;
  questionId: string;
  body: string;
  attachmentFileIds: string[];
  cisAdvisorySide: 'buyer_side' | 'seller_side';
}): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const releasedNow = input.cisAdvisorySide === 'buyer_side';
  const nextStatus = releasedNow ? 'approved' : 'answered';

  await db.transaction(async (tx) => {
    const [q] = await tx
      .select({ id: qnaQuestions.id, assigneeId: qnaQuestions.assigneeId })
      .from(qnaQuestions)
      .where(and(eq(qnaQuestions.id, input.questionId), eq(qnaQuestions.workspaceId, input.workspaceId)))
      .limit(1);
    if (!q) throw new Error('Question not found');

    const allowed = (await isCisTeamOrAdmin(input.workspaceId, session)) || q.assigneeId === session.userId;
    if (!allowed) throw new Error('Forbidden');

    const [msg] = await tx.insert(qnaMessages).values({
      questionId: input.questionId,
      authorId: session.userId,
      kind: 'proposed_answer',
      body: input.body,
    }).returning({ id: qnaMessages.id });

    if (input.attachmentFileIds.length > 0) {
      await tx.insert(qnaMessageFiles).values(
        input.attachmentFileIds.map((fileId) => ({ messageId: msg.id, fileId })),
      );
    }

    await tx.update(qnaQuestions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(qnaQuestions.id, input.questionId), eq(qnaQuestions.workspaceId, input.workspaceId)));

    await logActivity(tx, {
      workspaceId: input.workspaceId,
      userId: session.userId,
      action: 'qna_answered',
      targetType: 'qna_question',
      targetId: input.questionId,
    });

    if (releasedNow) {
      await logActivity(tx, {
        workspaceId: input.workspaceId,
        userId: session.userId,
        action: 'qna_approved',
        targetType: 'qna_question',
        targetId: input.questionId,
        metadata: { auto: true },
      });
    }
  });
}
