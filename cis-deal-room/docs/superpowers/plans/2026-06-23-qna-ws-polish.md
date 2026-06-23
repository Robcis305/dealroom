# Q&A / Workstreams Fixes & Polish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Address four post-launch issues on the Q&A + Workstreams feature: (1) center column doesn't fill the freed space when the right panel collapses + too much right padding; (2) confusing "Post reply" vs "Propose official answer" → a single composer with clear **Chat** / **Answer** buttons + helper copy; (4) member-management and answer/approve actions are admin-gated but their UI is reachable by non-admins and failures are silent → broaden to **admins + active CIS-team participants**, gate the UI, and surface errors via toast. (#3 — invited users not appearing — is environment/DB-dependent and tracked separately pending diagnostics.)

**Architecture:** Reuse existing patterns. A new `isCisTeamOrAdmin(workspaceId, session)` auth helper centralizes the "CIS side" check; DAL fns enforce it and routes let it throw → 403. UI gating flows a `canManageWorkstreams` boolean from the server page through `WorkspaceShell`. Toasts use the already-mounted `sonner` `<Toaster>`. The composer becomes a single component with a primary (**Answer**) + secondary (**Chat**) action. Layout: raise/remove center `max-width` and trim horizontal padding so the main column fills.

**Tech Stack:** Next.js 16.2.3, React 19, Drizzle, Vitest, `sonner` toasts, Tailwind v4 tokens.

## Global Constraints
- **Permission model:** "manage workstream members", "tag documents", "edit a workstream", and "approve/reroute a Q&A answer" = **global admin OR active `cis_team` participant** in that workspace. "Propose an official answer" = the question's **assignee** OR admin/cis_team. Plain participants can Chat and Ask. Hide manage/answer UI from those who lack the permission.
- **No silent failures:** every member/tag/answer/approval mutation that can 403/500 shows `toast.error(...)` with the server's error message on `!res.ok` or throw (rollback optimistic state too).
- **No DB migration.** All `qna_*`/workstream tables + enums already exist.
- **Tokens only** for theme (paper); reuse `sonner`'s `toast`.
- **Real gates:** `npm test`, `npm run typecheck`, `npm run build`. Lint not a gate (pre-existing repo errors); avoid NEW lint in changed files.
- **Branch:** `fix/qna-ws-polish` (already created off main).

---

## Task 1: `isCisTeamOrAdmin` auth helper + broaden DAL permissions

**Files:**
- Modify: `src/lib/dal/access.ts` (add helper), `src/lib/dal/workstreams.ts` (manage fns), `src/lib/dal/qna.ts` (approval + propose-answer)
- Modify tests: `src/lib/dal/workstreams.test.ts`, `src/lib/dal/qna.test.ts`

**Interfaces:**
- Produces: `isCisTeamOrAdmin(workspaceId: string, session: Session): Promise<boolean>` — `true` if `session.isAdmin`, else `true` iff an active `workspace_participants` row exists for `(workspaceId, session.userId)` with `role` in (`'cis_team'`, `'admin'`).

- [ ] **Step 1: Add the helper to `access.ts`**

```ts
import { workspaceParticipants } from '@/db/schema'; // already imported
// (reuse existing and/eq imports)

/** True if the session user is a global admin OR an active CIS-side participant. */
export async function isCisTeamOrAdmin(workspaceId: string, session: Session): Promise<boolean> {
  if (session.isAdmin) return true;
  const [row] = await db
    .select({ id: workspaceParticipants.id })
    .from(workspaceParticipants)
    .where(and(
      eq(workspaceParticipants.workspaceId, workspaceId),
      eq(workspaceParticipants.userId, session.userId),
      eq(workspaceParticipants.status, 'active'),
      inArray(workspaceParticipants.role, ['cis_team', 'admin']),
    ))
    .limit(1);
  return !!row;
}
```

Add `inArray` to the drizzle-orm import in access.ts if not present.

- [ ] **Step 2: Broaden the workstream manage fns** — in `workstreams.ts`, replace the `if (!session.isAdmin) throw new Error('Admin required')` guard in `addWorkstreamMember`, `removeWorkstreamMember`, `setFileWorkstreams`, and `updateWorkstream` with:

```ts
if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');
```

(import `isCisTeamOrAdmin` from `./access`). These fns already have `workspaceId` in scope.

- [ ] **Step 3: Broaden Q&A approval + propose-answer** — in `qna.ts`:
  - `applyApprovalAction`: replace its admin guard with `if (!(await isCisTeamOrAdmin(input.workspaceId, session))) throw new Error('Forbidden');`.
  - `submitProposedAnswer`: after verifySession, allow if the user is the question's assignee OR cis/admin. Fetch the question's `assigneeId` in the existing in-workspace SELECT (it already selects the question for the workspace-scope guard — add `assigneeId`), then: `const allowed = (await isCisTeamOrAdmin(input.workspaceId, session)) || q.assigneeId === session.userId; if (!allowed) throw new Error('Forbidden');`.

- [ ] **Step 4: Update tests** — in `workstreams.test.ts`/`qna.test.ts`, the existing "non-admin throws" cases now need the `isCisTeamOrAdmin` mock to return false → still throws. Mock `./access`'s `isCisTeamOrAdmin`: `vi.mock('./access', () => ({ isCisTeamOrAdmin: vi.fn() }))` and set it per-case (false → throws 'Forbidden'; true → proceeds). Add one case proving a cis_team (non-global-admin) is allowed (mock helper → true, session.isAdmin false). Keep all existing behavioral assertions.

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run src/lib/dal/workstreams.test.ts src/lib/dal/qna.test.ts && npm run typecheck` → PASS.
```bash
git add src/lib/dal/access.ts src/lib/dal/workstreams.ts src/lib/dal/qna.ts src/lib/dal/workstreams.test.ts src/lib/dal/qna.test.ts
git commit -m "feat(perms): allow CIS-team (not just global admins) to manage workstreams + answer/approve Q&A"
```

---

## Task 2: Route gates use the helper; add error toasts in the UI

**Files:**
- Modify routes: `src/app/api/workspaces/[id]/workstreams/[wsId]/members/route.ts` (POST/DELETE), `src/app/api/workspaces/[id]/workstreams/[wsId]/route.ts` (PATCH), `src/app/api/files/[id]/workstreams/route.ts` (PUT), `src/app/api/workspaces/[id]/qna/[qId]/approval/route.ts` (POST)
- Modify UI: `src/components/workspace/WorkstreamMembersModal.tsx`, `src/components/workspace/FileWorkstreamTags.tsx`

**Interfaces:**
- Consumes: `isCisTeamOrAdmin` (Task 1).

- [ ] **Step 1: Routes — drop the cheap `!session.isAdmin` precheck, enforce via the DAL throw.** In each listed route's mutating handler, REMOVE the `if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });` line (the DAL now enforces `isCisTeamOrAdmin` and throws `'Forbidden'`). Wrap the DAL call so the thrown error maps to 403:

```ts
try {
  await addWorkstreamMember(workspaceId, wsId, participantId as string);
} catch (e) {
  if (e instanceof Error && (e.message === 'Forbidden' || e.message === 'Unauthorized'))
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  throw e;
}
return Response.json({ ok: true });
```

Apply the same shape to members DELETE, file-tags PUT (`setFileWorkstreams`), workstream PATCH (`updateWorkstream`), and qna approval POST (`applyApprovalAction`). Keep `verifySession`→401 and `requireDealAccess`→403 and the JSON-guard.

- [ ] **Step 2: Toasts in `WorkstreamMembersModal.toggle`** — import `{ toast } from 'sonner'`. On `!res.ok` (and in the catch), after reverting the optimistic state, show the server message:

```ts
if (!res.ok) {
  setMemberIds(previous);
  const msg = await res.json().then((d) => d.error).catch(() => 'Could not update member');
  toast.error(typeof msg === 'string' ? msg : 'Could not update member');
  return;
}
```
And in `catch { setMemberIds(previous); toast.error('Could not update member'); }`.

- [ ] **Step 3: Toasts in `FileWorkstreamTags.toggle`** — same pattern: on `!res.ok`/catch, revert and `toast.error(...)` with the server error.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm test` → PASS.
```bash
git add "src/app/api/workspaces/[id]/workstreams" "src/app/api/files/[id]/workstreams" "src/app/api/workspaces/[id]/qna/[qId]/approval" src/components/workspace/WorkstreamMembersModal.tsx src/components/workspace/FileWorkstreamTags.tsx
git commit -m "fix(perms): route gates via isCisTeamOrAdmin + surface save errors as toasts"
```

---

## Task 3: Gate the Manage/answer UI to those who can use it

**Files:**
- Modify: `src/app/(app)/workspace/[workspaceId]/page.tsx`, `src/components/workspace/WorkspaceShell.tsx`, `src/components/workspace/FolderSidebar.tsx`, `src/components/workspace/WorkstreamSidebarSection.tsx`, `src/components/workspace/WorkstreamDashboard.tsx`, `src/components/workspace/FileWorkstreamTags.tsx`

**Interfaces:**
- Produces: a `canManageWorkstreams: boolean` prop threaded page → shell → sidebar/dashboard/file-tags. Computed server-side: `canManageWorkstreams = session.isAdmin || participantRole === 'cis_team'`.

- [ ] **Step 1: Compute in the page** — `src/app/(app)/workspace/[workspaceId]/page.tsx` already resolves `participantRole`. Add `const canManageWorkstreams = session.isAdmin || participantRole === 'cis_team';` and pass `canManageWorkstreams={canManageWorkstreams}` to `<WorkspaceShell>`.

- [ ] **Step 2: Thread through `WorkspaceShell`** — add `canManageWorkstreams: boolean` to props; pass to `FolderSidebar` (`canManageWorkstreams`), to `WorkstreamDashboard` (replace the `isAdmin` used for the Manage-members gate with `canManageWorkstreams`), and to `FileList`→`FileWorkstreamTags` (gate the tag-edit affordance with `canManageWorkstreams` instead of `isAdmin`).

- [ ] **Step 3: Gate the sidebar Manage link** — `WorkstreamSidebarSection` currently always renders the "Manage" link. Add a `canManage: boolean` prop; render the "Manage" link only when `canManage`. `FolderSidebar` passes `canManage={canManageWorkstreams}`. (Selecting a workstream to view its dashboard stays available to all; only the "Manage" affordance is gated.)

- [ ] **Step 4: Gate the dashboard Manage-members button** — `WorkstreamDashboard` "Manage members" button currently gated by `isAdmin`; change to a `canManage` prop fed by `canManageWorkstreams`.

- [ ] **Step 5: Gate file-tag editing** — `FileWorkstreamTags` currently shows the edit popover when `isAdmin`; change the gate prop to `canManage` fed by `canManageWorkstreams`. (Dots remain visible to all; only the edit affordance is gated.)

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npm test && npm run build` → PASS.
```bash
git add "src/app/(app)/workspace/[workspaceId]/page.tsx" src/components/workspace/WorkspaceShell.tsx src/components/workspace/FolderSidebar.tsx src/components/workspace/WorkstreamSidebarSection.tsx src/components/workspace/WorkstreamDashboard.tsx src/components/workspace/FileList.tsx src/components/workspace/FileWorkstreamTags.tsx
git commit -m "fix(perms): gate workstream Manage/tag UI to admins + CIS team"
```

---

## Task 4: Q&A composer redesign — Chat / Answer (Option A)

**Files:**
- Modify: `src/components/workspace/QnaComposer.tsx`, `src/components/workspace/QnaDetail.tsx`
- Modify test: `src/test/components/QnaComposer.test.tsx`

**Interfaces:**
- `QnaComposer` gains an optional **secondary** action so one composer renders two buttons. New props:
  `{ participants; placeholder; primary: { label: string; onSubmit: (body: string) => Promise<void> }; secondary?: { label: string; onSubmit: (body: string) => Promise<void> } }` — replacing the old single `submitLabel`/`onSubmit`. The primary button is red (`bg-accent text-text-inverse`); the secondary is neutral (`border border-border`). Both disabled when empty; both clear on success.

- [ ] **Step 1: Update the test** — `QnaComposer.test.tsx`: render with `secondary={{label:'Chat', onSubmit: chat}}` + `primary={{label:'Answer', onSubmit: answer}}`; assert both buttons disabled when empty; typing enables both; clicking **Chat** calls `chat(body)`, clicking **Answer** calls `answer(body)`; the box clears after a successful submit. (RED first.)

- [ ] **Step 2: Reimplement `QnaComposer`** — single `<textarea>` + the @mention autocomplete (keep existing mention logic), then a right-aligned button row: render `secondary` button (if provided) then `primary` button. Each calls its `onSubmit(value)` then clears on success; both disabled when `value.trim()===''` or submitting. Keep `participants`/`placeholder`.

- [ ] **Step 3: Rewire `QnaDetail`** — remove the old separate reply-composer + the "Propose official answer" toggle/second composer. Render ONE `QnaComposer`:
  - `secondary = { label: 'Chat', onSubmit: postReply }` (always present).
  - `primary` is the **Answer** action `{ label: 'Answer', onSubmit: submitAnswer }` ONLY when the user can answer (`canAnswer = isAdmin || question.assigneeId === currentUserId || isCisTeam`); when they can't, render the composer with the single Chat action as primary (or pass only the Chat button). To keep it simple: if `canAnswer`, pass both `primary:Answer` + `secondary:Chat`; else pass `primary:{label:'Chat', onSubmit:postReply}` and no secondary.
  - Add the helper line under the composer (muted, `text-xs text-text-muted`): **"Chat to discuss or clarify · Answer is the official response — CIS reviews it before the asker sees it."** (Show the full helper only when `canAnswer`; otherwise a short "Add a clarification or follow-up.")
  - `canAnswer` needs whether the user is CIS-team. Thread an `canAnswer` (or `isCisTeam`) boolean into `QnaDetail` from `QnaView` ← shell ← page (`canManageWorkstreams` already represents admin||cis_team; reuse it as `canManage`, and `canAnswer = canManage || question.assigneeId === currentUserId`). Pass `canManage` down to `QnaDetail`.

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run src/test/components/QnaComposer.test.tsx && npm run typecheck && npm test` → PASS.
```bash
git add src/components/workspace/QnaComposer.tsx src/components/workspace/QnaDetail.tsx src/components/workspace/QnaView.tsx src/components/workspace/WorkspaceShell.tsx src/test/components/QnaComposer.test.tsx
git commit -m "feat(qna): single composer with Chat/Answer buttons + helper copy"
```

---

## Task 5: Layout sweep — fill the freed space, trim right padding

**Files:**
- Modify: `src/components/workspace/DealOverview.tsx`, `src/components/workspace/QnaList.tsx`, `src/components/workspace/QnaDetail.tsx`, `src/components/workspace/WorkstreamDashboard.tsx`, `src/components/workspace/ChecklistView.tsx`, `src/app/(app)/workspace/[workspaceId]/cap-table/page.tsx` (and `CapTablePage.tsx` if that's where the width cap lives)

**Interfaces:** none (presentational).

- [ ] **Step 1: Audit the width caps** — Run: `grep -rn "max-w-\[\|max-w-\|mx-auto" src/components/workspace/DealOverview.tsx src/components/workspace/QnaList.tsx src/components/workspace/QnaDetail.tsx src/components/workspace/WorkstreamDashboard.tsx src/components/workspace/ChecklistView.tsx` to find the fixed `max-width`/centering that leaves the right gap.

- [ ] **Step 2: Widen + trim** — for each center view's outermost container: remove the narrow `max-w-[NNNpx]` cap (or raise it substantially, e.g. to `max-w-[1600px]`) and reduce the horizontal padding (e.g. `px-6`/`p-6` → `px-5`, or keep but ensure the container is `w-full`). The goal: the content fills the main column (which is `flex-1` in `WorkspaceShell`) and no longer leaves a large empty band on the right when the side panel is collapsed. Keep readable line lengths on text-heavy areas (Q&A detail thread can keep a comfortable max width on the LEFT column only, not the whole view).

- [ ] **Step 3: Verify visually + gates** — Run: `npm run build && npm test` → PASS. (Visual confirmation happens on the preview in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace
git commit -m "fix(layout): center views fill the main column; trim right padding"
```

---

## Task 6: Verify + PR
- [ ] Full gates: `npm test && npm run typecheck && npm run build`.
- [ ] Push `fix/qna-ws-polish`; open PR summarizing #1/#2/#4 fixes; note #3 still pending environment diagnosis.

## Self-Review Notes
- **#3 is NOT in this plan** — invited-user-not-appearing is environment/DB-dependent (separate local/preview/prod DBs) and needs the user's Network/env data to localize; do not fabricate a code fix for it here.
- **Permission consistency:** the same `isCisTeamOrAdmin` gate must back BOTH the DAL (enforcement) and the UI (`canManageWorkstreams` visibility) so a visible control never 403s. `canAnswer` additionally includes the assignee.
- **Toasts:** every optimistic rollback now pairs with a `toast.error` carrying the server message — that also surfaces the real cause of #4 if it's not a permission issue.
