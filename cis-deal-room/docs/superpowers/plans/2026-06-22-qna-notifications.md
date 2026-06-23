# Q&A Notifications Implementation Plan (PR3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Q&A lifecycle events into the existing `enqueueOrSend` notification pipeline so the right people are emailed (respecting each user's immediate/digest preference): the **assignee** when a question is assigned/rerouted to them, **CIS reviewers** when a sell-side answer awaits the approval gate, and the **asker** when their question's answer is released.

**Architecture:** Reuse the existing `enqueueOrSend` infrastructure (immediate email vs. daily-digest queue, per the user's prefs) exactly as the checklist-assigned notifications do. Add a `'qna'` channel that is never muted by the `notifyUploads` toggle (Q&A notifications are transactional, not "uploads"). One parameterized React-Email template covers all three Q&A emails. A new `enqueue-qna-notifications.ts` module resolves recipients and calls `enqueueOrSend`; the Q&A routes call it **after** the DAL mutation commits, best-effort (a notification failure never fails the request). No database migration — the `qna_*` activity actions and `qna_question` target already exist from PR2's `0017`.

**Tech Stack:** Next.js 16.2.3 (App Router), React 19, Drizzle ORM, `@react-email/components`, Vitest.

## Global Constraints

- **No migration.** The `qna_asked|qna_assigned|qna_answered|qna_approved|qna_changes_requested|qna_rerouted|qna_message_posted` activity actions and the `qna_question` target type already exist (PR2 / migration `0017`). `notification_queue.action` is the `activity_action` enum — these values are already valid.
- **Reuse `enqueueOrSend`** (`src/lib/notifications/enqueue-or-send.ts`); mirror the recipient-resolution pattern in `src/lib/notifications/enqueue-checklist-assigned.ts`. Do NOT build a new delivery mechanism.
- **Notifications are best-effort:** the route calls the enqueue fn in a `try/catch` (or `.catch`) AFTER the DAL mutation succeeds; a failure logs and is swallowed — it MUST NOT change the HTTP response or roll back the mutation. (Matches how the checklist routes treat notifications.)
- **Channel:** add `'qna'` to the `enqueueOrSend` `Channel` type. The `'qna'` channel is NOT gated by `notifyUploads` (only `'uploads'` is); it still respects `notifyDigest` (queue vs immediate).
- **Email template** is React-Email, mirroring `src/lib/email/checklist-assigned.tsx` styling (logo, heading, item box, red CTA button, footer). Workspace URL via `getAppUrl()`.
- **CIS reviewers** = active `workspace_participants` whose `role` is `'cis_team'` or `'admin'` (the deal's CIS side). If none exist, send nothing.
- **Test convention** (mirror `src/lib/dal/workstreams.test.ts` / `src/lib/notifications/enqueue-or-send.test.ts`): Vitest, `vi.mock`/`vi.doMock` for `@/db`, `./enqueue-or-send`, `@/db/schema`; `beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); })`.
- **Real gates:** `npm test`, `npm run typecheck`, `npm run build`. `npm run lint` is NOT a gate (~73 pre-existing repo-wide errors); only avoid NEW lint in changed files.
- **Branch:** off `main` (PR1/PR2/theme are merged): `git checkout main && git pull && git checkout -b feat/qna-notifications`.

---

## File Structure

**Create:**
- `src/lib/email/qna-notification.tsx` — one parameterized React-Email template for all three Q&A emails.
- `src/lib/notifications/enqueue-qna-notifications.ts` — `enqueueQnaAssignedNotification`, `enqueueQnaAnswerSubmittedNotification`, `enqueueQnaApprovedNotification`.
- `src/lib/notifications/enqueue-qna-notifications.test.ts`

**Modify:**
- `src/lib/notifications/enqueue-or-send.ts` — add `'qna'` to the `Channel` type (the existing mute logic already only gates `'uploads'`, so no logic change is needed beyond the type).
- `src/lib/notifications/enqueue-or-send.test.ts` — add a test that a `'qna'`-channel notification is NOT muted by `notifyUploads = false`.
- `src/app/api/workspaces/[id]/qna/route.ts` — POST: after create, notify the proposed assignee (if any).
- `src/app/api/workspaces/[id]/qna/[qId]/answer/route.ts` — after submit: sell-side → notify CIS reviewers; buy-side (auto-released) → notify asker.
- `src/app/api/workspaces/[id]/qna/[qId]/approval/route.ts` — after action: `approve` → notify asker; `reroute` with a new assignee → notify that assignee.
- `src/lib/email/daily-digest.tsx` — add `qna_*` labels to the `actionLabel` map.
- `src/app/api/cron/digest/route.ts` — resolve a queued event's `targetName` from `metadata.title` (the question title) in addition to `metadata.fileName`.

---

## Task 1: `'qna'` notification channel

**Files:**
- Modify: `src/lib/notifications/enqueue-or-send.ts`, `src/lib/notifications/enqueue-or-send.test.ts`

**Interfaces:**
- Produces: `Channel = 'uploads' | 'digest' | 'qna'`. `enqueueOrSend` behavior for `'qna'`: never muted by `notifyUploads`; enqueues to the digest queue when `notifyDigest` is true, else sends immediately.

- [ ] **Step 1: Write the failing test** — append to `enqueue-or-send.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/lib/notifications/enqueue-or-send.test.ts`
Expected: FAIL — `'qna'` is not assignable to `Channel` (type error) / or the call is rejected.

- [ ] **Step 3: Implement** — in `enqueue-or-send.ts` change the `Channel` type:

```ts
type Channel = 'uploads' | 'digest' | 'qna';
```

No other change is required: the mute guard is `if (input.channel === 'uploads' && !prefs.notifyUploads) return;`, which already leaves `'qna'` unmuted, and the `notifyDigest` branch already handles queue-vs-immediate.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notifications/enqueue-or-send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/enqueue-or-send.ts src/lib/notifications/enqueue-or-send.test.ts
git commit -m "feat(qna-notify): add 'qna' notification channel (not muted by uploads pref)"
```

---

## Task 2: Q&A email template

**Files:**
- Create: `src/lib/email/qna-notification.tsx`

**Interfaces:**
- Produces: `QnaNotificationEmail({ heading, intro, questionTitle, workspaceName, workspaceUrl }: { heading: string; intro: string; questionTitle: string; workspaceName: string; workspaceUrl: string })` — a React element.

- [ ] **Step 1: Implement** (mirror `src/lib/email/checklist-assigned.tsx` styles verbatim; only the body content differs)

```tsx
// src/lib/email/qna-notification.tsx
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from '@react-email/components';
import { getAppUrl } from '@/lib/app-url';

interface Props {
  heading: string;
  intro: string;
  questionTitle: string;
  workspaceName: string;
  workspaceUrl: string;
}

export function QnaNotificationEmail({ heading, intro, questionTitle, workspaceName, workspaceUrl }: Props) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading}: {questionTitle}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img src={`${getAppUrl()}/cis-partners-logo.png`} alt="CIS Partners" width="160" style={{ display: 'block', marginBottom: '32px' }} />
          <Heading style={headingStyle}>{heading}</Heading>
          <Text style={textStyle}>{intro} <strong>{workspaceName}</strong>:</Text>
          <Section style={itemBoxStyle}>
            <Text style={itemNameStyle}>{questionTitle}</Text>
          </Section>
          <Section style={buttonSectionStyle}>
            <Button href={workspaceUrl} style={buttonStyle}>View in Deal Room</Button>
          </Section>
          <Text style={mutedStyle}>Or open <Link href={workspaceUrl} style={linkStyle}>{workspaceUrl}</Link></Text>
          <Text style={footerStyle}>CIS Partners Advisory &mdash; Confidential</Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = { backgroundColor: '#f4f4f5', fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: '40px 0' };
const containerStyle: React.CSSProperties = { backgroundColor: '#ffffff', borderRadius: '8px', maxWidth: '480px', margin: '0 auto', padding: '40px 32px' };
const headingStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '24px', fontWeight: '700', margin: '0 0 16px' };
const textStyle: React.CSSProperties = { color: '#52525B', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px' };
const itemBoxStyle: React.CSSProperties = { backgroundColor: '#f4f4f5', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px' };
const itemNameStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '15px', fontWeight: '600', margin: 0, lineHeight: '1.5' };
const buttonSectionStyle: React.CSSProperties = { textAlign: 'center', margin: '0 0 24px' };
const buttonStyle: React.CSSProperties = { backgroundColor: '#E10600', borderRadius: '6px', color: '#ffffff', display: 'inline-block', fontSize: '16px', fontWeight: '600', padding: '12px 32px', textDecoration: 'none' };
const mutedStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '13px', lineHeight: '1.5', margin: '0 0 24px' };
const linkStyle: React.CSSProperties = { color: '#E10600', textDecoration: 'underline' };
const footerStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '12px', margin: '0' };
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/qna-notification.tsx
git commit -m "feat(qna-notify): Q&A notification email template"
```

---

## Task 3: Enqueue module — assigned / answer-submitted / approved

**Files:**
- Create: `src/lib/notifications/enqueue-qna-notifications.ts`
- Test: `src/lib/notifications/enqueue-qna-notifications.test.ts`

**Interfaces:**
- Consumes: `enqueueOrSend` (Task 1), `QnaNotificationEmail` (Task 2), `db`, schema tables.
- Produces:
  - `enqueueQnaAssignedNotification(input: { workspaceId: string; questionId: string; assigneeUserId: string }): Promise<void>` — emails the assignee ("You've been assigned a question").
  - `enqueueQnaAnswerSubmittedNotification(input: { workspaceId: string; questionId: string }): Promise<void>` — emails CIS reviewers (active participants with role `cis_team`/`admin`) ("An answer awaits your approval").
  - `enqueueQnaApprovedNotification(input: { workspaceId: string; questionId: string }): Promise<void>` — emails the asker ("Your question has been answered").

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications/enqueue-qna-notifications.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('enqueueQnaApprovedNotification()', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('emails the asker with action qna_approved on the qna channel', async () => {
    const enqueueOrSend = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./enqueue-or-send', () => ({ enqueueOrSend }));
    // 1st select: question (title, askedById, workspaceName); 2nd select: asker email
    const question = [{ title: 'Revenue bridge?', askedById: 'asker-1', workspaceName: 'Project Falcon' }];
    const asker = [{ id: 'asker-1', email: 'asker@x.com', firstName: 'L', lastName: 'B' }];
    let call = 0;
    vi.doMock('@/db', () => ({
      db: { select: vi.fn(() => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => (call++ === 0 ? question : asker) }) }), where: () => ({ limit: async () => (call === 0 ? question : asker) }) }) })) },
    }));
    vi.doMock('@/db/schema', () => ({ qnaQuestions: {}, workspaces: {}, users: {}, workspaceParticipants: {} }));
    const { enqueueQnaApprovedNotification } = await import('./enqueue-qna-notifications');
    await enqueueQnaApprovedNotification({ workspaceId: 'w1', questionId: 'q1' });
    expect(enqueueOrSend).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'asker-1', action: 'qna_approved', targetType: 'qna_question', targetId: 'q1', channel: 'qna',
    }));
  });
});
```

> The DB mock chain is permissive; align it to your final query order. The behavioral contract is: resolves the asker and calls `enqueueOrSend` once with `action:'qna_approved'`, `channel:'qna'`, `targetId` = the questionId.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notifications/enqueue-qna-notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/notifications/enqueue-qna-notifications.ts
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { qnaQuestions, workspaces, users, workspaceParticipants } from '@/db/schema';
import { enqueueOrSend } from './enqueue-or-send';
import { QnaNotificationEmail } from '@/lib/email/qna-notification';
import { getAppUrl } from '@/lib/app-url';

const CIS_ROLES = ['cis_team', 'admin'] as const;

function nameOrEmail(u: { firstName: string | null; lastName: string | null; email: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

/** Loads question title + workspace name for the email body. Returns null if not found. */
async function loadQuestionContext(workspaceId: string, questionId: string) {
  const [row] = await db
    .select({ title: qnaQuestions.title, askedById: qnaQuestions.askedById, assigneeId: qnaQuestions.assigneeId, workspaceName: workspaces.name })
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
  const workspaceUrl = `${getAppUrl()}/workspace/${opts.workspaceId}`;
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
```

> `nameOrEmail` is exported-style but currently unused by the email body (the template takes names indirectly); if lint flags it as unused, delete it. Keep imports tight.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notifications/enqueue-qna-notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Add tests for the assigned + answer-submitted fns** — `enqueueQnaAssignedNotification` calls `enqueueOrSend` once with `action:'qna_assigned'` for the assignee; `enqueueQnaAnswerSubmittedNotification` calls it once per CIS reviewer with `action:'qna_answered'` (mock 2 reviewers → 2 calls). Run the file → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/enqueue-qna-notifications.ts src/lib/notifications/enqueue-qna-notifications.test.ts
git commit -m "feat(qna-notify): enqueue module (assigned / answer-submitted / approved)"
```

---

## Task 4: Wire notifications into the Q&A routes

**Files:**
- Modify: `src/app/api/workspaces/[id]/qna/route.ts` (POST), `src/app/api/workspaces/[id]/qna/[qId]/answer/route.ts`, `src/app/api/workspaces/[id]/qna/[qId]/approval/route.ts`

**Interfaces:**
- Consumes: the three enqueue fns from Task 3. Each call is best-effort: wrapped so a failure logs and never affects the response.

- [ ] **Step 1: Wire the create route** — in `qna/route.ts` POST, after `const { id } = await createQuestion({...})` succeeds and before returning, if the request body included an `assigneeId`:

```ts
import { enqueueQnaAssignedNotification } from '@/lib/notifications/enqueue-qna-notifications';
// … after createQuestion returns { id }:
if (assigneeId) {
  try {
    await enqueueQnaAssignedNotification({ workspaceId, questionId: id, assigneeUserId: assigneeId });
  } catch (e) { console.error('[qna] assigned notification failed', e); }
}
return Response.json({ id });
```

(`assigneeId` is the value already passed into `createQuestion`.)

- [ ] **Step 2: Wire the answer route** — in `answer/route.ts`, after `submitProposedAnswer(...)` succeeds, using the `cisAdvisorySide` already resolved there:

```ts
import { enqueueQnaAnswerSubmittedNotification, enqueueQnaApprovedNotification } from '@/lib/notifications/enqueue-qna-notifications';
// … after submitProposedAnswer:
try {
  if (cisAdvisorySide === 'seller_side') {
    await enqueueQnaAnswerSubmittedNotification({ workspaceId, questionId: qId });
  } else {
    await enqueueQnaApprovedNotification({ workspaceId, questionId: qId }); // buy-side auto-released
  }
} catch (e) { console.error('[qna] answer notification failed', e); }
return Response.json({ ok: true });
```

- [ ] **Step 3: Wire the approval route** — in `approval/route.ts`, after `applyApprovalAction({...})` succeeds, using the validated `action` and `newAssigneeId`:

```ts
import { enqueueQnaApprovedNotification, enqueueQnaAssignedNotification } from '@/lib/notifications/enqueue-qna-notifications';
// … after applyApprovalAction:
try {
  if (action === 'approve') {
    await enqueueQnaApprovedNotification({ workspaceId, questionId: qId });
  } else if (action === 'reroute' && newAssigneeId) {
    await enqueueQnaAssignedNotification({ workspaceId, questionId: qId, assigneeUserId: newAssigneeId });
  }
} catch (e) { console.error('[qna] approval notification failed', e); }
return Response.json({ ok: true });
```

- [ ] **Step 4: Typecheck** — Run: `npm run typecheck` → PASS. Confirm each route already has `workspaceId`, `qId`, `cisAdvisorySide`/`action`/`newAssigneeId`/`assigneeId` in scope at the call site (read each route first; they were created in PR2 Task 9).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/workspaces/[id]/qna"
git commit -m "feat(qna-notify): fire notifications from create/answer/approval routes"
```

---

## Task 5: Digest rendering for Q&A events

**Files:**
- Modify: `src/lib/email/daily-digest.tsx`, `src/app/api/cron/digest/route.ts`

**Interfaces:**
- Produces: the daily digest renders queued `qna_*` events with a readable verb and the question title.

- [ ] **Step 1: Add Q&A labels** — in `daily-digest.tsx`, extend the `actionLabel` map (inside the `map` object) with:

```ts
    qna_assigned: 'assigned you a question on',
    qna_answered: 'submitted an answer for review on',
    qna_approved: 'released an answer on',
```

- [ ] **Step 2: Resolve the question title in the digest** — in `cron/digest/route.ts`, change the `targetName` resolution so a queued Q&A event shows its question title. Replace the existing `targetName:` expression with one that prefers `metadata.title`, then `metadata.fileName`, then `targetType`:

```ts
      targetName:
        (e.metadata && typeof (e.metadata as Record<string, unknown>).title === 'string'
          ? ((e.metadata as Record<string, unknown>).title as string)
          : null) ??
        (e.metadata && typeof (e.metadata as Record<string, unknown>).fileName === 'string'
          ? ((e.metadata as Record<string, unknown>).fileName as string)
          : null) ??
        e.targetType,
```

- [ ] **Step 3: Typecheck + full suite** — Run: `npm run typecheck && npm test` → PASS (the digest has no dedicated test asserting labels; the change is additive and type-safe).

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/daily-digest.tsx src/app/api/cron/digest/route.ts
git commit -m "feat(qna-notify): digest labels + question title for Q&A events"
```

---

## Task 6: Verify + PR

**Files:** none (verification only)

- [ ] **Step 1: Full gates** — Run: `npm test && npm run typecheck && npm run build` → all PASS.

- [ ] **Step 2: Manual sanity (optional, local with `npm run dev`)** — with Resend stubbed (no API key), the immediate path logs the email payload; confirm: assigning a question logs an assignee email; submitting an answer on a sell-side workspace logs CIS-reviewer email(s); approving logs an asker email; on a buy-side workspace, submitting an answer logs the asker email directly. (No DB migration to apply — `0017` already covers the actions.)

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/qna-notifications
gh pr create --title "feat(qna): lifecycle email notifications (PR3)" --body "$(cat <<'EOF'
## Summary
PR3 — wires Q&A lifecycle events into the existing enqueueOrSend pipeline (immediate vs daily digest per user prefs).
- **Assignee** notified on assign/reroute.
- **CIS reviewers** (cis_team/admin participants) notified when a sell-side answer awaits the approval gate.
- **Asker** notified when the answer is released (CIS approve, or buy-side auto-release).
- New `'qna'` channel (not muted by the uploads toggle); one parameterized email template; digest renders Q&A events with the question title.

No database migration — the qna_* activity actions + qna_question target already exist (0017). Notifications are best-effort (a failure never fails the request or rolls back the mutation).

## Test plan
- Unit: 'qna' channel not muted by notifyUploads; enqueue fns resolve the right recipients + call enqueueOrSend with the right action/channel.
- Gates: npm test, typecheck, build.
- Manual: stubbed-Resend log check across assign / submit (sell + buy) / approve.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage:** assignee-on-assign ✓ (T3/T4), CIS-on-answer (sell-side) ✓ (T3/T4), asker-on-release (approve + buy-side auto) ✓ (T3/T4), respects immediate/digest ✓ (reuses enqueueOrSend, T1), digest rendering ✓ (T5). Reply-posted notifications are intentionally OUT of scope (would be noisy; revisit if requested).
- **No migration** — confirm before starting that `notification_queue.action` accepts `qna_*` (it's the `activity_action` enum extended in 0017). If a route insert ever rejects a qna action, the enum wasn't applied to that DB — but that's an existing-state issue, not this PR's.
- **Best-effort contract:** every route call site wraps the enqueue in try/catch and logs. Never `await` it in a way that can fail the response. Reviewer: flag any call site missing the guard.
- **Recipient correctness:** assignee/asker are `users.id`; CIS reviewers are resolved by `workspace_participants.role in (cis_team, admin)` + active. A user with `notifyDigest` gets a queue row (not an immediate email) — that's correct, not a missing email.
- **Risk:** the enqueue test mocks are query-shape-sensitive; align the mock to the real call order, assert the behavioral contract (right recipient, right action, channel `'qna'`).
