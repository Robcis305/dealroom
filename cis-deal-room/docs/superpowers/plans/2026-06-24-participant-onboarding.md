# Participant Onboarding Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins assign workstreams at invite time (just like folder access), and greet each participant on first entry with a one-time welcome modal showing their role, folders, and workstreams.

**Architecture:** Workstream membership becomes assignable to invited (not-yet-accepted) participants and is written alongside folder access in the same invite/update transaction. A new `onboarded_at` flag on the participant drives a one-time welcome modal rendered over the workspace shell.

**Tech Stack:** Next.js 16.2.3, React 19, Drizzle ORM + Neon Postgres, Vitest + Testing Library, zod.

## Global Constraints
- **Spec:** `docs/superpowers/specs/2026-06-24-participant-onboarding-design.md` (source of truth).
- **Workstream membership mirrors folder access** — assignable at invite time, visible once the participant accepts. View-only participants remain excluded from workstream membership.
- **Relax the active-only rule:** invited participants are eligible workstream members everywhere.
- **Welcome is one-time per deal room**, tracked by `workspace_participants.onboarded_at`. Shown when `status = 'active' AND onboarded_at IS NULL`. Creator is pre-marked. Existing rows are backfilled.
- **Welcome is a modal over the workspace shell (Approach B)** — not a separate page. The existing `/complete-profile` name step is unchanged.
- **Cross-workspace guard:** every `workstreamId` supplied to an invite/update must belong to that workspace (mirror `assertAllFoldersInWorkspace`).
- **Migrations** are hand-written `src/db/migrations/NNNN_*.sql` + idempotent `scripts/apply-NNNN-direct.mjs` (neon http; `ADD COLUMN IF NOT EXISTS`; verify section exits non-zero on failure). Applied per-environment (local/preview/prod are separate DBs).
- **Gates:** `npm test` (FULL suite), `npm run typecheck`, `npm run build`. Implementers run the FULL suite before commit (a prior phase broke the build running only focused tests).
- **Branch:** `feat/participant-onboarding` (off main; Phase 1 + 2 merged).

---

## File Structure

**Create:**
- `src/db/migrations/0019_participant_onboarding.sql` + `scripts/apply-0019-direct.mjs` — add `onboarded_at`.
- `src/app/api/workspaces/[id]/onboarded/route.ts` — mark the caller onboarded.
- `src/components/workspace/WelcomeModal.tsx` — first-run welcome.

**Modify:**
- `src/db/schema.ts` — `onboardedAt` column on `workspaceParticipants`.
- `src/lib/dal/participants.ts` — `assertAllWorkstreamsInWorkspace`, `workstreamIds` on invite/update, `getParticipants.workstreamIds`, `markOnboarded`, `getWelcomeForParticipant`.
- `src/lib/dal/workspaces.ts` — creator participant insert sets `onboarded_at`.
- `src/lib/dal/workstreams.ts` — `addWorkstreamMember` drops the active-only rejection.
- `src/app/api/workspaces/[id]/participants/route.ts` + `.../participants/[pid]/route.ts` — `workstreamIds` in schemas.
- `src/app/api/workspaces/[id]/workstreams/[wsId]/members/route.ts` — drop the `ParticipantNotActive` mapping.
- `src/components/workspace/WorkstreamMembersModal.tsx` — list invited participants.
- `src/components/deals/wizard/StepWorkstreams.tsx`, `NewDealWizard.tsx`, `wizard/StepInvite.tsx` — created-workstreams thread + invite multiselect.
- `src/components/workspace/ParticipantFormModal.tsx` — workstreams multiselect.
- `src/app/(app)/workspace/[workspaceId]/page.tsx` + `src/components/workspace/WorkspaceShell.tsx` — welcome prop + modal mount.

---

## Task 1: Migration 0019 + schema — `onboarded_at`

**Files:** Create `src/db/migrations/0019_participant_onboarding.sql`, `scripts/apply-0019-direct.mjs`; Modify `src/db/schema.ts`.

**Interfaces:** Produces `workspaceParticipants.onboardedAt` (Drizzle `timestamp('onboarded_at')`, nullable).

- [ ] **Step 1: Write the SQL** — `src/db/migrations/0019_participant_onboarding.sql`:
```sql
ALTER TABLE workspace_participants ADD COLUMN IF NOT EXISTS onboarded_at timestamp;
-- Existing participants should not suddenly see a welcome.
UPDATE workspace_participants SET onboarded_at = coalesce(activated_at, now()) WHERE onboarded_at IS NULL;
```

- [ ] **Step 2: Write the apply script** — `scripts/apply-0019-direct.mjs` (mirror `scripts/apply-0018-direct.mjs`'s structure: neon http client from `DATABASE_URL`, run statements, verify, `process.exit(1)` on failure):
```js
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
console.log('=== 1. add onboarded_at column ===');
await sql`ALTER TABLE workspace_participants ADD COLUMN IF NOT EXISTS onboarded_at timestamp`;
console.log('done');
console.log('=== 2. backfill existing rows ===');
const res = await sql`UPDATE workspace_participants SET onboarded_at = coalesce(activated_at, now()) WHERE onboarded_at IS NULL`;
console.log('backfilled rows:', res.length ?? 'ok');
console.log('=== verify ===');
const [{ remaining }] = await sql`SELECT count(*)::int AS remaining FROM workspace_participants WHERE onboarded_at IS NULL`;
console.log('rows still null (must be 0):', remaining);
const [{ present }] = await sql`SELECT (to_regclass('workspace_participants') IS NOT NULL) AS present`;
if (remaining !== 0 || !present) { console.error('VERIFY FAILED'); process.exit(1); }
console.log('OK');
```

- [ ] **Step 3: Add the column to the Drizzle schema** — in `src/db/schema.ts`, `workspaceParticipants` table, after `activatedAt`:
```ts
  onboardedAt: timestamp('onboarded_at'),
```

- [ ] **Step 4: Apply locally + typecheck**
Run: `DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '\"')" node scripts/apply-0019-direct.mjs`
Expected: prints `OK`, `rows still null (must be 0): 0`.
Run: `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**
```bash
git add src/db/migrations/0019_participant_onboarding.sql scripts/apply-0019-direct.mjs src/db/schema.ts
git commit -m "feat(onboarding): migration 0019 — workspace_participants.onboarded_at"
```

> **Note for controller:** preview + production applies of 0019 are user-run (DB-gated), same as 0018.

---

## Task 2: DAL — workstream persistence on invite/update + `getParticipants.workstreamIds`

**Files:** Modify `src/lib/dal/participants.ts`; Test `src/lib/dal/participants.test.ts` (create if absent — check first).

**Interfaces:**
- Consumes: `workstreamMembers` table (`{ workstreamId, participantId, addedBy }`), `workstreams` table.
- Produces: `InviteInput`/`UpdateInput` gain `workstreamIds: string[]`; `inviteParticipant`/`updateParticipant` persist `workstream_members`; `getParticipants` rows gain `workstreamIds: string[]`.

- [ ] **Step 1: Add the cross-workspace guard** (after `assertAllFoldersInWorkspace`, ~line 44). Import `workstreams`, `workstreamMembers` from `@/db/schema` (add to the existing import) and `workstreams` for the guard:
```ts
async function assertAllWorkstreamsInWorkspace(
  tx: Tx,
  workspaceId: string,
  workstreamIds: string[]
): Promise<void> {
  if (workstreamIds.length === 0) return;
  const rows = await tx
    .select({ id: workstreams.id, workspaceId: workstreams.workspaceId })
    .from(workstreams)
    .where(inArray(workstreams.id, workstreamIds));
  if (rows.length !== workstreamIds.length) throw new Error('Workstream not found');
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) throw new Error('Forbidden');
  }
}
```

- [ ] **Step 2: Extend the input types** — `InviteInput` and `UpdateInput`:
```ts
interface InviteInput {
  workspaceId: string;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
  workstreamIds: string[];
}
```
```ts
interface UpdateInput {
  role: ParticipantRole;
  folderIds: string[];
  workstreamIds: string[];
}
```

- [ ] **Step 3: Persist workstream members in `inviteParticipant`** — immediately after the folder_access insert block (after the `if (input.folderIds.length > 0) { ... }`), add:
```ts
    // Workstream membership — mirror folder access (assignable to invited participants).
    await assertAllWorkstreamsInWorkspace(tx, input.workspaceId, input.workstreamIds);
    await tx.delete(workstreamMembers).where(eq(workstreamMembers.participantId, participant.id));
    if (input.workstreamIds.length > 0) {
      await tx.insert(workstreamMembers).values(
        input.workstreamIds.map((workstreamId) => ({
          workstreamId,
          participantId: participant.id,
          addedBy: session.userId,
        }))
      );
    }
```

- [ ] **Step 4: Persist workstream members in `updateParticipant`** — inside its transaction, alongside where it replaces folder_access (mirror the same delete-then-insert; use the existing participant id variable and `assertAllWorkstreamsInWorkspace(tx, existing.workspaceId, input.workstreamIds)`). Match the exact folder_access replacement pattern already in that function.

- [ ] **Step 5: Add `workstreamIds` to `getParticipants`** — add a **correlated subquery** to the select (NOT a join — a second left-join would cartesian-multiply against `folder_access`):
```ts
      workstreamIds: sql<string[]>`(
        select coalesce(array_agg(wm.workstream_id), '{}')
        from workstream_members wm
        where wm.participant_id = ${workspaceParticipants.id}
      )`,
```

- [ ] **Step 6: Write/extend tests** (`src/lib/dal/participants.test.ts`) — follow the existing `vi.doMock` style used in `workspaces.test.ts`:
  - `inviteParticipant` with `workstreamIds: ['w1']` inserts into `workstreamMembers` with `{ workstreamId: 'w1', participantId, addedBy }` and deletes existing first.
  - `assertAllWorkstreamsInWorkspace` throws `'Forbidden'` when a workstream belongs to another workspace, and `'Workstream not found'` when an id is missing.
  - `getParticipants` select includes the `workstreamIds` subquery (assert the returned shape carries `workstreamIds`).

- [ ] **Step 7: Run focused tests → typecheck → FULL suite**
Run: `npx vitest run src/lib/dal/participants.test.ts` → PASS; then `npm run typecheck` and `npm test` → green.

- [ ] **Step 8: Commit**
```bash
git commit -am "feat(onboarding): persist workstream memberships on invite/update + getParticipants.workstreamIds"
```

---

## Task 3: DAL — `markOnboarded` + creator pre-mark

**Files:** Modify `src/lib/dal/participants.ts`, `src/lib/dal/workspaces.ts`; Test the respective `*.test.ts`.

**Interfaces:** Produces `markOnboarded(workspaceId: string, session: Session): Promise<void>` (sets `onboarded_at = now()` on the caller's own active participant row; idempotent). Creator participant row created with `onboardedAt: new Date()`.

- [ ] **Step 1: Write the failing test** for `markOnboarded` (`participants.test.ts`): with a session userId, it issues an UPDATE on `workspace_participants` scoped to `workspaceId AND userId = session.userId` setting `onboardedAt`. (Mock `db.update().set().where()` and assert `set` received an `onboardedAt`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `markOnboarded`** (participants.ts):
```ts
export async function markOnboarded(workspaceId: string, session: Session): Promise<void> {
  await db
    .update(workspaceParticipants)
    .set({ onboardedAt: new Date() })
    .where(and(
      eq(workspaceParticipants.workspaceId, workspaceId),
      eq(workspaceParticipants.userId, session.userId),
    ));
}
```
(Import `Session` type from `@/types` if not already imported.)

- [ ] **Step 4: Pre-mark the creator** — in `src/lib/dal/workspaces.ts` `createWorkspace`, the creator-participant insert (added in Phase 2) sets `onboardedAt`:
```ts
    await tx.insert(workspaceParticipants).values({
      workspaceId: workspace.id,
      userId: session.userId,
      role: 'cis_team',
      status: 'active',
      activatedAt: new Date(),
      onboardedAt: new Date(),
    });
```

- [ ] **Step 5: Update the createWorkspace test** — `workspaces.test.ts` already asserts the creator participant payload `{ userId, role: 'cis_team', status: 'active' }`; extend the `toMatchObject` to also assert it carries an `onboardedAt` (e.g. `expect(participantValues.onboardedAt).toBeInstanceOf(Date)`).

- [ ] **Step 6: Run → PASS; typecheck; FULL suite.**

- [ ] **Step 7: Commit**
```bash
git commit -am "feat(onboarding): markOnboarded DAL + creator pre-marked onboarded"
```

---

## Task 4: API — `workstreamIds` on invite/update routes + `POST /onboarded`

**Files:** Modify `src/app/api/workspaces/[id]/participants/route.ts`, `src/app/api/workspaces/[id]/participants/[pid]/route.ts`; Create `src/app/api/workspaces/[id]/onboarded/route.ts`.

**Interfaces:**
- Consumes: `inviteParticipant`/`updateParticipant` (now take `workstreamIds`), `markOnboarded`, `requireDealAccess`, `verifySession`.
- Produces: `POST /api/workspaces/:id/onboarded → { ok: true }`.

- [ ] **Step 1: Invite schema** — `participants/route.ts`, add to `inviteSchema`:
```ts
  workstreamIds: z.array(z.string().uuid()).default([]),
```
and pass `workstreamIds: parsed.workstreamIds` into the `inviteParticipant(...)` call (alongside `folderIds`).

- [ ] **Step 2: Update schema** — `participants/[pid]/route.ts`: add the same `workstreamIds: z.array(z.string().uuid()).default([])` to its update schema and forward it to `updateParticipant(pid, { role, folderIds, workstreamIds })`.

- [ ] **Step 3: Create the onboarded route** — `src/app/api/workspaces/[id]/onboarded/route.ts`:
```ts
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { markOnboarded } from '@/lib/dal/participants';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  await markOnboarded(workspaceId, session);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Tests** — if route tests exist for participants (check `src/test/api/`), extend to assert the invite POST forwards `workstreamIds`. Add a focused test for `POST /onboarded` returning `{ ok: true }` and calling `markOnboarded`. If there's no route-test harness for these, the DAL tests (Tasks 2–3) cover the logic — note that in the report and rely on typecheck + build.

- [ ] **Step 5: typecheck + FULL suite → green.**

- [ ] **Step 6: Commit**
```bash
git commit -am "feat(onboarding): routes accept workstreamIds; POST /onboarded endpoint"
```

---

## Task 5: Relax the active-only workstream rule

**Files:** Modify `src/lib/dal/workstreams.ts`, `src/app/api/workspaces/[id]/workstreams/[wsId]/members/route.ts`, `src/components/workspace/WorkstreamMembersModal.tsx`; Update `src/lib/dal/workstreams.test.ts`, `src/test/components/WorkstreamMembersModal.test.tsx`.

**Interfaces:** `addWorkstreamMember` no longer throws `ParticipantNotActive`; invited participants become eligible.

- [ ] **Step 1: Update the failing tests first** — in `workstreams.test.ts`, the test `target participant inactive → throws ParticipantNotActive` should be changed to assert an **invited** participant is now ALLOWED (proceeds to insert), and the `view_only` test stays (`throws ParticipantViewOnly`). Run → the "inactive throws" expectation now FAILS against current code.

- [ ] **Step 2: Relax the DAL** — `addWorkstreamMember` in `workstreams.ts`, change the eligibility block to:
```ts
  // View-only participants cannot join a workstream; invited participants CAN
  // (membership is assignable before they accept, mirroring folder access).
  if (!targetRow) throw new Error('ParticipantNotFound');
  if (targetRow.role === 'view_only') throw new Error('ParticipantViewOnly');
```
(Remove the `status !== 'active'` check.)

- [ ] **Step 3: Drop the dead mapping** — in the members route POST catch, remove the `ParticipantNotActive` branch (keep `Forbidden`, `ParticipantViewOnly` → 409, `ParticipantNotFound` → 404).

- [ ] **Step 4: Modal filter** — `WorkstreamMembersModal.tsx`, change the eligibility filter:
```ts
const eligible = participants.filter((p) => p.role !== 'view_only');
```
and update the excluded-note wording to reference only view-only (e.g. `{excluded} view-only participant(s) not shown.`).

- [ ] **Step 5: Update the modal test** — `WorkstreamMembersModal.test.tsx` currently asserts invited (`bob@x.com`) is EXCLUDED. Change that expectation: invited Bob is now **shown**; only the view-only participant (`carol@x.com`) is excluded; the excluded-note count becomes 1.

- [ ] **Step 6: Run focused tests → typecheck → FULL suite → green.**

- [ ] **Step 7: Commit**
```bash
git commit -am "feat(onboarding): allow invited participants as workstream members (relax active-only)"
```

---

## Task 6: Wizard — assign workstreams in the Invite step

**Files:** Modify `src/components/deals/wizard/StepWorkstreams.tsx`, `src/components/deals/NewDealWizard.tsx`, `src/components/deals/wizard/StepInvite.tsx`; Test `src/test/components/NewDealWizard.test.tsx`.

**Interfaces:**
- `StepWorkstreams` `onDone` now passes `created: { id: string; name: string }[]`.
- `NewDealWizard` holds `createdWorkstreams` and passes it to `StepInvite` as `workstreams`.
- `StepInvite` gains `workstreams: { id: string; name: string }[]` and posts `workstreamIds` per row.

- [ ] **Step 1: StepWorkstreams returns the created list** — change its `onDone` prop type to `(created: { id: string; name: string }[]) => void`; in the commit fn, collect each created workstream from the `POST /workstreams` `{ workstream }` response (`const body = await res.json(); created.push({ id: body.workstream.id, name: body.workstream.name })`), and call `onDone(created)` (zero-checked path → `onDone([])`).

- [ ] **Step 2: Container threads createdWorkstreams** — in `NewDealWizard.tsx`: add `const [createdWorkstreams, setCreatedWorkstreams] = useState<{ id: string; name: string }[]>([])`; the StepWorkstreams `onDone` becomes `(created) => { setCreatedWorkstreams(created); advance(); }`; pass `workstreams={createdWorkstreams}` to `<StepInvite>`.

- [ ] **Step 3: StepInvite workstreams multiselect** — add `workstreams: { id: string; name: string }[]` to `StepInviteProps` and the destructure. Per invite row, add a workstreams multiselect mirroring the existing folder-access control (checkbox list over `workstreams` + an "All workstreams" toggle), holding a `workstreamIds` set in the row state. In the commit fn's `POST /participants` body, include `workstreamIds: [...row.workstreamIds]` alongside `folderIds`.

- [ ] **Step 4: Test** — extend `NewDealWizard.test.tsx`: drive to the Invite step with `workstreams` present (or render StepInvite directly), add a row with an email + a selected workstream, mock the participants POST, trigger commit → assert the POST body includes `workstreamIds: [<id>]`.

- [ ] **Step 5: Run → typecheck → FULL suite → green.**

- [ ] **Step 6: Commit**
```bash
git commit -am "feat(onboarding): wizard Invite step assigns workstreams"
```

---

## Task 7: Standalone add-participant modal — workstreams multiselect

**Files:** Modify `src/components/workspace/ParticipantFormModal.tsx` and its parent that renders it (pass the `workstreams` list); Test `src/test/components/ParticipantFormModal.test.tsx` (if present).

**Interfaces:** `ParticipantFormModal` gains `workstreams: { id: string; name: string }[]` and posts/patches `workstreamIds`.

- [ ] **Step 1: Add the prop + state** — `ParticipantFormModal.tsx`: add `workstreams: { id: string; name: string }[]` to its props; add `const [workstreamIds, setWorkstreamIds] = useState<Set<string>>(new Set(existing?.workstreamIds ?? []))` (pre-check in edit mode); add a `toggleWorkstream` mirroring `toggleFolder`.

- [ ] **Step 2: Render the multiselect** — below the folders control, render the workstreams checkbox list (over the `workstreams` prop) + an "All workstreams" toggle, matching the folders control's markup/tokens.

- [ ] **Step 3: Include in the request body** — in the submit, add `workstreamIds: [...workstreamIds]` to BOTH the invite (POST) and edit (PATCH) bodies (alongside `folderIds`).

- [ ] **Step 4: Pass `workstreams` from the parent** — find where `ParticipantFormModal` is rendered (the participants panel / shell), and pass the workspace's workstreams (already loaded for the shell) as `workstreams={...}`. Map to `{ id, name }`.

- [ ] **Step 5: Test** — if a `ParticipantFormModal.test.tsx` exists, extend: rendering in invite mode with `workstreams` present, selecting one, and submitting posts `workstreamIds: [<id>]`. If no test harness exists, rely on typecheck + build and note it.

- [ ] **Step 6: Run → typecheck → FULL suite → green.**

- [ ] **Step 7: Commit**
```bash
git commit -am "feat(onboarding): add-participant modal assigns workstreams (invite + edit)"
```

---

## Task 8: Welcome modal (first-run)

**Files:** Modify `src/lib/dal/participants.ts` (`getWelcomeForParticipant`), `src/app/(app)/workspace/[workspaceId]/page.tsx`, `src/components/workspace/WorkspaceShell.tsx`; Create `src/components/workspace/WelcomeModal.tsx`; Test `src/test/components/WelcomeModal.test.tsx`.

**Interfaces:**
- Produces `getWelcomeForParticipant(workspaceId, session, side: CisAdvisorySide): Promise<{ roleLabel: string; folders: string[]; workstreams: string[] } | null>` — returns `null` when no welcome is due (admin/no participant, not active, or already onboarded).
- `WorkspaceShell` gains a `welcome` prop of that shape (or `null`).

- [ ] **Step 1: DAL `getWelcomeForParticipant`** — looks up the caller's participant row (`workspaceId AND userId AND status='active'`) selecting `id, role, onboardedAt`. If none or `onboardedAt != null` → return `null`. Else fetch folder names (join `folder_access`→`folders` for that participant id) and workstream names (join `workstream_members`→`workstreams`), and return `{ roleLabel: roleLabel(role, side), folders, workstreams }`. Import `roleLabel` from `@/lib/participants/roles`.

- [ ] **Step 2: Test the DAL** — `participants.test.ts`: returns `null` when `onboardedAt` is set; returns `{ roleLabel, folders, workstreams }` when null+active. (Mock the participant lookup + the two name queries.)

- [ ] **Step 3: Page computes the prop** — `page.tsx`: after resolving the participant, call `const welcome = await getWelcomeForParticipant(workspaceId, session, workspace.cisAdvisorySide)` and pass `welcome={welcome}` to `<WorkspaceShell>`.

- [ ] **Step 4: WelcomeModal component** — `src/components/workspace/WelcomeModal.tsx` (client). Props `{ workspaceId: string; dealName: string; roleLabel: string; folders: string[]; workstreams: string[] }`. Reuse the shared `Modal` (`@/components/ui/Modal`). Render heading "Welcome to {dealName}", "You've been added as **{roleLabel}**.", a "Folders you can access" list (empty → "No folders yet."), a "Workstreams you're on" list (empty → "No workstreams yet."), and a primary **"Enter deal room"** button that, on click, `POST`s `/api/workspaces/{workspaceId}/onboarded` via `fetchWithAuth`, shows a busy state, and on success calls an `onDismiss()` prop. Do not close on backdrop click (the mark-onboarded call must fire).

- [ ] **Step 5: Mount in the shell** — `WorkspaceShell.tsx`: accept `welcome` prop; `const [showWelcome, setShowWelcome] = useState(!!welcome)`; when `welcome && showWelcome`, render `<WelcomeModal dealName={workspace.name} roleLabel={welcome.roleLabel} folders={welcome.folders} workstreams={welcome.workstreams} workspaceId={workspace.id} onDismiss={() => setShowWelcome(false)} />`.

- [ ] **Step 6: Test the component** — `WelcomeModal.test.tsx`: renders the role/folders/workstreams; clicking "Enter deal room" POSTs to `/onboarded` and calls `onDismiss`. (Mock `fetchWithAuth`.)

- [ ] **Step 7: Run → typecheck → FULL suite → green.**

- [ ] **Step 8: Commit**
```bash
git commit -am "feat(onboarding): one-time welcome modal on first entry"
```

---

## Task 9: Verify + PR

- [ ] **Step 1:** Manual sanity (`npm run dev`): create a deal, invite a participant with a folder + a workstream; accept via the magic link in another browser → complete-profile → land in the room → welcome modal shows the right role/folders/workstreams → "Enter" dismisses it and it does NOT reappear on reload. Confirm the participant appears as a workstream member.
- [ ] **Step 2:** Full gates: `npm test && npm run typecheck && npm run build`.
- [ ] **Step 3:** Push `feat/participant-onboarding`; open PR. **Note:** migration 0019 must be applied to preview before testing and to production at merge (user-run). Final whole-branch review confirms: view-only still excluded from workstreams; cross-workspace workstream ids rejected; `markOnboarded`/`/onboarded` only mutate the caller's own row.

---

## Self-Review Notes (for the executor)
- **Spec coverage:** workstreams-at-invite (Tasks 2,4,6,7) ✓; active-only relaxation (Task 5) ✓; welcome modal + onboarded_at (Tasks 1,3,4,8) ✓; creator pre-mark + backfill (Tasks 1,3) ✓; both invite entry points (6 wizard, 7 standalone) ✓.
- **Cartesian-join trap:** `getParticipants.workstreamIds` MUST be a correlated subquery (Task 2 Step 5), not a second left-join — a join would multiply the existing `folder_access` aggregate. Do not "simplify" it into a join.
- **Type consistency:** `workstreamIds: string[]` flows InviteInput/UpdateInput → schemas → DAL inserts. `welcome` shape `{ roleLabel; folders; workstreams }` is identical in `getWelcomeForParticipant`, the page prop, and `WorkspaceShell`. `StepWorkstreams.onDone(created)` shape `{ id; name }[]` matches `createdWorkstreams` and `StepInvite.workstreams`.
- **Migration ordering:** Task 1 lands first (schema `onboardedAt` is referenced by Tasks 3 and 8). Apply 0019 locally before Task 3/8 tests run against a real DB (unit tests mock the DB, so they don't need it, but `npm run dev` sanity in Task 9 does).
- **Don't rebuild:** folders + participants + workstreams endpoints already exist; only `/onboarded` is new. Mirror the folder-access control for the workstreams multiselect rather than inventing a new pattern.
