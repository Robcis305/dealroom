import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  qnaQuestions, qnaQuestionWorkstreams, qnaRecipients,
  workstreams, users,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import type { QnaStatus, QnaVisibility, QnaQuestionRow } from '@/types';

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
  const nameOf = (f: string | null, l: string | null, e: string) => [f, l].filter(Boolean).join(' ') || e;
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
