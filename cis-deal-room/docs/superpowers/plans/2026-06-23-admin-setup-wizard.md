# Admin Deal Setup Wizard Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "New Deal" into a 4-step guided wizard (Details → Folders → Workstreams → Invite) that creates the workspace and persists each step, landing the admin in a ready-to-use deal room.

**Architecture:** A `NewDealWizard` container holds step state + the created `workspaceId` and renders one focused component per step. The Details step creates the workspace immediately; each later step persists via existing APIs (folders, participants) plus one new endpoint for creating a chosen canonical workstream. Workstreams no longer auto-seed — they exist only when explicitly created — so the admin's selection is honored.

**Tech Stack:** Next.js 16.2.3, React 19, Drizzle ORM, Vitest + Testing Library, `zod`, Tailwind tokens.

## Global Constraints
- **Spec:** `docs/superpowers/specs/2026-06-23-admin-setup-wizard-design.md` (source of truth).
- **Persist per step:** Details creates the workspace (`POST /api/workspaces`); each later step persists immediately via real API calls; the wizard holds `workspaceId`. Each step after Details is skippable. Exiting mid-wizard leaves a usable deal.
- **Folders:** canonical 8 — Financials, Legal, Operations, Human Capital, Tax, Technology, Deal Documents, Miscellaneous — all pre-checked; uncheckable; plus add-custom rows.
- **Workstreams:** the 5 canonical (Legal, Finance, Technology, HR, Commercial), **none pre-selected**; create only the checked ones via the new endpoint.
- **Invite:** per row — email + role (`assignableRolesFor(side)`, the 5-role set) + folder access (multiselect of folders created in step 2 + an "All folders" shortcut). Reuse `POST /api/workspaces/:id/participants` (creates invited participant + folder_access + invitation email).
- **Reconciliation:** STOP auto-seeding all 5 workstreams in the read path (`listWorkstreamsWithCounts`); workstreams exist only when explicitly created. Existing deals keep their seeded rows.
- **Status defaults to `engagement`** (not asked in the wizard).
- **No DB migration** (folders/workstreams/participants tables exist).
- **Real gates:** `npm test`, `npm run typecheck`, `npm run build`. Lint not a gate (pre-existing errors); only NEW lint counts. Implementers run the FULL suite before commit.
- **Branch:** `feat/admin-setup-wizard` (off main, Phase 1 merged).

---

## File Structure
**Create:**
- `src/components/deals/NewDealWizard.tsx` — wizard container (step machine, progress, nav, holds workspaceId + created-folder list for the invite step).
- `src/components/deals/wizard/StepDetails.tsx` — codename/client/side; creates the workspace.
- `src/components/deals/wizard/StepFolders.tsx` — the 8 + custom; creates folders.
- `src/components/deals/wizard/StepWorkstreams.tsx` — the 5, none checked; creates selected.
- `src/components/deals/wizard/StepInvite.tsx` — invite rows (email/role/folder access).
- Tests: `src/test/components/NewDealWizard.test.tsx`, plus focused step tests where useful.

**Modify:**
- `src/lib/dal/workstreams.ts` — add `createWorkstreamByKey(workspaceId, key)`; remove the auto-seed call from `listWorkstreamsWithCounts` (and delete `ensureWorkstreams` if unused).
- `src/app/api/workspaces/[id]/workstreams/route.ts` — add `POST { key }` handler.
- `src/components/deals/DealList.tsx` — open `NewDealWizard` instead of `NewDealModal`.
- `src/lib/dal/workstreams.test.ts` — add createWorkstreamByKey tests + assert no auto-seed.
- Retire `src/components/deals/NewDealModal.tsx` once unreferenced.

---

## Task 1: Backend — `createWorkstreamByKey` + POST route + stop auto-seed

**Files:** `src/lib/dal/workstreams.ts`, `src/app/api/workspaces/[id]/workstreams/route.ts`, `src/lib/dal/workstreams.test.ts`.

**Interfaces:**
- Produces: `createWorkstreamByKey(workspaceId: string, key: string): Promise<Workstream>` — admin/CIS-only (`isCisTeamOrAdmin`), validates `key` ∈ `CANONICAL_WORKSTREAMS`, idempotent on `(workspaceId, key)`, returns the created or existing row. `POST /api/workspaces/:id/workstreams` body `{ key }` → `{ workstream }`. `listWorkstreamsWithCounts` no longer seeds.

- [ ] **Step 1: Write failing tests** (workstreams.test.ts): (a) `createWorkstreamByKey` non-cis/admin → throws Forbidden (mock `isCisTeamOrAdmin`→false); (b) valid key + authorized → inserts with the canonical name/color and returns the row; (c) invalid key → throws; (d) `listWorkstreamsWithCounts` does NOT call insert/seed (mock the select chain returning [] and assert the result is [] with no insert).

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/dal/workstreams.test.ts`.

- [ ] **Step 3: Implement** in `workstreams.ts`:

```ts
import { CANONICAL_WORKSTREAMS } from '@/lib/workstreams/constants';
import { isCisTeamOrAdmin } from './access';

export async function createWorkstreamByKey(workspaceId: string, key: string): Promise<Workstream> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!(await isCisTeamOrAdmin(workspaceId, session))) throw new Error('Forbidden');
  const def = CANONICAL_WORKSTREAMS.find((w) => w.key === key);
  if (!def) throw new Error('Invalid workstream key');
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(workstreams).values({
      workspaceId, key: def.key, name: def.name, color: def.color,
      tileTint: def.tileTint, description: def.description, sortOrder: def.sortOrder,
    }).onConflictDoNothing().returning();
    if (created) {
      await logActivity(tx, { workspaceId, userId: session.userId, action: 'workstream_updated',
        targetType: 'workstream', targetId: created.id, metadata: { created: true, key: def.key } });
      return created;
    }
    const [existing] = await tx.select().from(workstreams)
      .where(and(eq(workstreams.workspaceId, workspaceId), eq(workstreams.key, def.key))).limit(1);
    return existing;
  });
}
```
Remove the `await ensureWorkstreams(workspaceId);` line from `listWorkstreamsWithCounts`. If `ensureWorkstreams` is now unused (grep), delete it. (Reuse the existing `workstream_updated` activity action — no migration.)

- [ ] **Step 4: Add the POST route** to `workstreams/route.ts` (mirror the cap-table route conventions):

```ts
import { listWorkstreamsWithCounts, createWorkstreamByKey } from '@/lib/dal/workstreams';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.key !== 'string') return Response.json({ error: 'key required' }, { status: 400 });
  try {
    const workstream = await createWorkstreamByKey(workspaceId, body.key);
    return Response.json({ workstream }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && (e.message === 'Forbidden' || e.message === 'Unauthorized')) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (e instanceof Error && e.message === 'Invalid workstream key') return Response.json({ error: 'Invalid workstream key' }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 5: Run tests → PASS;** `npm run typecheck`; `npm test` (full suite — confirm nothing relied on auto-seed; if a workstreams/dashboard test assumed 5 seeded rows, update it to create explicitly).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(setup): create-workstream-by-key endpoint; stop auto-seeding all 5"`

---

## Task 2: Wizard container + Details step

**Files:** `src/components/deals/NewDealWizard.tsx`, `src/components/deals/wizard/StepDetails.tsx`, `src/components/deals/DealList.tsx`; test `src/test/components/NewDealWizard.test.tsx`.

**Interfaces:**
- Produces: `<NewDealWizard open onClose />`. Internal step state `'details'|'folders'|'workstreams'|'invite'`. Holds `workspaceId: string | null`, `cisAdvisorySide`, and `createdFolders: {id;name}[]` (for the invite step). `StepDetails` props: `{ onCreated: (ws: { id; cisAdvisorySide }) => void }`.

- [ ] **Step 1: Failing test** — render `NewDealWizard`, fill Details (codename/client/side), mock `fetchWithAuth` for `POST /api/workspaces` → `{ id: 'w1', cisAdvisorySide: 'seller_side' }`, click Next → assert it advances to the Folders step (e.g. "Folders" heading visible). Assert Details cannot be skipped (no Skip on step 1).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** the container (Modal wrapper with a progress header showing the 4 steps; Back/Next/Skip footer; Skip hidden on Details). `StepDetails` reuses the existing NewDealModal fields (codename, client name, advisory side; status omitted — POST sends `status: 'engagement'`), calls `POST /api/workspaces`, and on success calls `onCreated({id, cisAdvisorySide})` which stores them and advances to Folders. Reuse `Modal`, `Input`, `Button`. On the final step, "Finish" routes to `/workspace/:id`; closing/cancel after creation also routes there (the deal exists).

- [ ] **Step 4: Wire DealList** — replace the `NewDealModal` usage in `DealList.tsx` with `NewDealWizard` (same open/close trigger).

- [ ] **Step 5: Run → PASS;** typecheck + full suite.

- [ ] **Step 6: Commit** — `git commit -am "feat(setup): NewDealWizard container + Details step"`

---

## Task 3: Folders step

**Files:** `src/components/deals/wizard/StepFolders.tsx`; extend the wizard test.

**Interfaces:** `StepFolders` props `{ workspaceId: string; onDone: (createdFolders: {id;name}[]) => void; onSkip: () => void }`. Creates checked + custom folders via `POST /api/workspaces/:id/folders`, returns the created list to the container.

- [ ] **Step 1: Failing test** — render with the 8 defaults all checked; uncheck one; add a custom name; mock the folders POST; click Next → assert one POST per remaining folder (8 - 1 + 1 custom = 8) and `onDone` called with the created list. Skip → `onSkip` called, no POST.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — render the 8 canonical names as checkboxes (default checked) + an "add custom folder" input that appends rows; on Next, `Promise.all` a `POST /api/workspaces/:id/folders { name }` per selected/custom folder, collect `{id,name}` from each 201 response, call `onDone(created)`. Show per-folder errors inline without losing the step. Use tokens.

- [ ] **Step 4: Run → PASS;** typecheck + full suite.

- [ ] **Step 5: Commit** — `git commit -am "feat(setup): wizard Folders step"`

---

## Task 4: Workstreams step

**Files:** `src/components/deals/wizard/StepWorkstreams.tsx`; extend the wizard test.

**Interfaces:** `StepWorkstreams` props `{ workspaceId: string; onDone: () => void; onSkip: () => void }`. Creates each selected canonical workstream via `POST /api/workspaces/:id/workstreams { key }` (Task 1).

- [ ] **Step 1: Failing test** — render the 5 canonical (from `CANONICAL_WORKSTREAMS`) as checkboxes, NONE checked by default; check two; mock the workstreams POST; Next → assert exactly two POSTs with the right `key`s, `onDone` called. Skip → no POST.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — map `CANONICAL_WORKSTREAMS` to checkbox rows (color dot via inline style + name), none checked; on Next, `Promise.all` a `POST /api/workspaces/:id/workstreams { key }` per checked key; `onDone()`. Inline error handling.

- [ ] **Step 4: Run → PASS;** typecheck + full suite.

- [ ] **Step 5: Commit** — `git commit -am "feat(setup): wizard Workstreams step"`

---

## Task 5: Invite step

**Files:** `src/components/deals/wizard/StepInvite.tsx`; extend the wizard test.

**Interfaces:** `StepInvite` props `{ workspaceId: string; cisAdvisorySide: CisAdvisorySide; folders: {id;name}[]; onFinish: () => void; onSkip: () => void }`. Posts each row via `POST /api/workspaces/:id/participants { email, role, folderIds }`.

- [ ] **Step 1: Failing test** — render with `folders` from the prior step; add one invite row (email + role from `assignableRolesFor(side)` + select a folder, or "All folders"); mock the participants POST; Finish → assert a POST with `{ email, role, folderIds: [...] }`; `onFinish` called. Skip → no POST, `onSkip` called.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — a list of invite rows (add/remove). Each row: email input, role `<select>` from `assignableRolesFor(cisAdvisorySide)`, and a folder-access control — a multiselect over `folders` plus an "All folders" checkbox that selects all. A soft note under a row when role is non-CIS and no folders selected ("They won't see documents until granted folder access"). On Finish, `Promise.all` `POST /api/workspaces/:id/participants` per row with `{ email, role, folderIds }`; on all-success `onFinish()` (container routes to `/workspace/:id`). Inline per-row errors (incl. the counterparty deal-killer ack 400 — surface the message; full ack flow is out of scope, just show the error). Empty list + Finish/Skip → route in with no invites.

- [ ] **Step 4: Run → PASS;** typecheck + full suite.

- [ ] **Step 5: Commit** — `git commit -am "feat(setup): wizard Invite step"`

---

## Task 6: Wire-up, retire NewDealModal, verify + PR

- [ ] **Step 1:** Confirm `NewDealWizard` fully replaces `NewDealModal` (grep for remaining `NewDealModal` references; delete the file + its test if unreferenced, or keep if still used elsewhere — grep first).
- [ ] **Step 2:** Manual sanity (`npm run dev`): create a deal end-to-end — details → uncheck a folder + add a custom → pick 2 workstreams → invite one Client with a folder → land in the room; confirm folders, the 2 workstreams (not 5), and the invited participant all present.
- [ ] **Step 3:** Full gates: `npm test && npm run typecheck && npm run build`.
- [ ] **Step 4:** Push `feat/admin-setup-wizard`; open PR. **Note:** no DB migration; depends on Phase 1 (merged). Final whole-branch review.

---

## Self-Review Notes (for the executor)
- **Spec coverage:** wizard flow ✓ (T2), persist-per-step ✓ (T2 creates workspace; steps persist), folders 8+custom ✓ (T3), workstreams pick-from-5 + new endpoint + no auto-seed ✓ (T1/T4), invite email/role/folder-access ✓ (T5), retire NewDealModal ✓ (T6). Status defaults to engagement ✓ (T2).
- **Auto-seed reconciliation is Task 1 and lands first** — the Workstreams step (T4) depends on the new endpoint AND on auto-seed being off (else unpicked workstreams reappear). If any existing test assumed 5 auto-seeded workstreams, update it in T1.
- **Folder→invite handoff:** the container threads `createdFolders` from T3 into T5's folder-access control. Keep the `{id,name}` shape consistent.
- **Skippability:** every step after Details has Skip; Details is required (Cancel instead). Exiting after creation routes into the (partially set-up) deal.
- **Reuse, don't rebuild:** folders + participants endpoints are reused as-is; only the workstream POST is new. Don't add a batch endpoint (YAGNI) — per-item POSTs in `Promise.all` are fine at setup scale.
