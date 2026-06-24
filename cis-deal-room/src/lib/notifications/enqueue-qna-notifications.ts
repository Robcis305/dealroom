import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { qnaQuestions, workspaces, users, workspaceParticipants } from '@/db/schema';
import { enqueueOrSend } from './enqueue-or-send';
import { QnaNotificationEmail } from '@/lib/email/qna-notification';
import { getAppUrl } from '@/lib/app-url';

const CIS_ROLES = ['cis_team', 'admin'] as const;

/** Loads question title + workspace name for the email body. Returns null if not found. */
async function loadQuestionContext(workspaceId: string, questionId: string) {
  const [row] = await db
    .select({ title: qnaQuestions.title, askedById: qnaQuestions.askedById, workspaceName: workspaces.name })
    .from(qnaQuestions)
    .innerJoin(workspaces, eq(workspaces.id, qnaQuestions.workspaceId))
    .where(and(eq(qnaQuestions.id, questionId), eq(qnaQuestions.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

async function send(opts: {
  userId: string; email: string; workspaceId: string; questionId: string;
  action: 'qna_assigned' | 'qna_answered' | 'qna_approved';
  heading: string; intro: string; questionTitle: string; workspaceName: string;
}) {
  // Deep-link straight to the question; WorkspaceShell reads ?tab=qna&question=<id>.
  const workspaceUrl = `${getAppUrl()}/workspace/${opts.workspaceId}?tab=qna&question=${opts.questionId}`;
  await enqueueOrSend({
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    action: opts.action,
    targetType: 'qna_question',
    targetId: opts.questionId,
    metadata: { title: opts.questionTitle },
    channel: 'qna',
    immediateEmail: async () => ({
      to: opts.email,
      subject: `${opts.heading}: ${opts.questionTitle}`,
      react: QnaNotificationEmail({
        heading: opts.heading, intro: opts.intro, questionTitle: opts.questionTitle,
        workspaceName: opts.workspaceName, workspaceUrl,
      }),
    }),
  });
}

export async function enqueueQnaAssignedNotification(input: { workspaceId: string; questionId: string; assigneeUserId: string }): Promise<void> {
  const ctx = await loadQuestionContext(input.workspaceId, input.questionId);
  if (!ctx) return;
  const [u] = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users).where(eq(users.id, input.assigneeUserId)).limit(1);
  if (!u) return;
  await send({
    userId: u.id, email: u.email, workspaceId: input.workspaceId, questionId: input.questionId,
    action: 'qna_assigned', heading: "You've been assigned a question", intro: 'A diligence question was assigned to you on',
    questionTitle: ctx.title, workspaceName: ctx.workspaceName,
  });
}

export async function enqueueQnaAnswerSubmittedNotification(input: { workspaceId: string; questionId: string }): Promise<void> {
  const ctx = await loadQuestionContext(input.workspaceId, input.questionId);
  if (!ctx) return;
  const reviewers = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(and(
      eq(workspaceParticipants.workspaceId, input.workspaceId),
      eq(workspaceParticipants.status, 'active'),
      inArray(workspaceParticipants.role, [...CIS_ROLES]),
    ));
  await Promise.all(reviewers.map((u) => send({
    userId: u.id, email: u.email, workspaceId: input.workspaceId, questionId: input.questionId,
    action: 'qna_answered', heading: 'An answer awaits your approval', intro: 'A proposed answer is ready for CIS review on',
    questionTitle: ctx.title, workspaceName: ctx.workspaceName,
  })));
}

export async function enqueueQnaApprovedNotification(input: { workspaceId: string; questionId: string }): Promise<void> {
  const ctx = await loadQuestionContext(input.workspaceId, input.questionId);
  if (!ctx) return;
  const [u] = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users).where(eq(users.id, ctx.askedById)).limit(1);
  if (!u) return;
  await send({
    userId: u.id, email: u.email, workspaceId: input.workspaceId, questionId: input.questionId,
    action: 'qna_approved', heading: 'Your question has been answered', intro: 'The official answer has been released on',
    questionTitle: ctx.title, workspaceName: ctx.workspaceName,
  });
}
