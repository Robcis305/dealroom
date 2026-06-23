# Role Model Redesign Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-role participant model with a 5-role, side-relative model (CIS Team · Client · Client Counsel · Counterparty · View-only, + internal Admin), with an explicit permission matrix, a side-aware migration of existing data, and removal of the Client-required banner.

**Architecture:** "Buyer vs seller" is derived from `workspaces.cisAdvisorySide`, never stored per person. Two new enum values (`client_counsel`, `counterparty`) are added; the four `*_rep`/`*_counsel` and the deprecated `counsel` are migrated off and left dormant in the pgEnum. Authorization changes are concentrated in the existing helpers (`canPerform`, `applyCapTableVisibilityGate`, `ownerFilterForSession`, `isCisTeamOrAdmin`). `viewOnlyShadowSide` is retired.

**Tech Stack:** Next.js 16.2.3, React 19, Drizzle ORM (Postgres/Neon), Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-role-model-design.md` — the permission matrix there is the source of truth.
- **Active roles after this change:** `admin`, `cis_team`, `client`, `client_counsel`, `counterparty`, `view_only`. Deprecated (migrated off, dormant in enum, NOT offered in UI): `seller_rep`, `buyer_rep`, `seller_counsel`, `buyer_counsel`, `counsel`.
- **Side-relative:** roles never encode buyer/seller; the deal's `cisAdvisorySide` derives it. `Client`/`Client Counsel` = CIS's side; `Counterparty` = the other side.
- **Permissions:** Manage (deal admin, workstream member mgmt, Q&A approve/reroute) = `cis_team` role OR global admin (`isCisTeamOrAdmin`, already shipped). Upload = `cis_team`/`client`/`client_counsel`/`admin` only. Counterparty + View-only cannot upload. Cap table: full for `cis_team`/`client`/`client_counsel`/`admin`; `counterparty` + `view_only` = **published only**. Checklist edit: not Counterparty/View-only. Q&A ask/chat: everyone except `view_only`. Official Answer: assignee OR `isCisTeamOrAdmin`. Workstream members / Q&A assignees: **active, non-view-only** participants only.
- **No Client-required banner** — remove it and the `activeClientCount` plumbing.
- **`ParticipantRole` is defined in TWO places** — `src/types/index.ts` AND `src/lib/dal/permissions.ts`. Keep both in sync (or consolidate permissions.ts to import from `@/types`).
- **Migration convention:** hand-written `src/db/migrations/0018_role_model.sql` + idempotent `scripts/apply-0018-direct.mjs` (style of `apply-0016-direct.mjs`). NOT drizzle-kit. Local/preview/prod are separate DBs; apply to each.
- **Real gates:** `npm test`, `npm run typecheck`, `npm run build`. Lint not a gate (~73 pre-existing errors); only avoid NEW lint in changed files.
- **Branch:** `feat/role-model` (already created; spec committed).
- **Deferred (NOT in this plan):** Admin-setup flow (Phase 2), Participant-onboarding flow + the dashboard-counts bug (Phase 3).

---

## File Structure

**Modify:**
- `src/db/schema.ts` — add `client_counsel`, `counterparty` to `participantRoleEnum`; deprecation comments.
- `src/types/index.ts` — add the two values to `ParticipantRole`; deprecation comments.
- `src/lib/dal/permissions.ts` — add the two values to its `ParticipantRole`; update `canPerform`.
- `src/lib/participants/roles.ts` — `roleLabel` (handle new + keep deprecated), `assignableRolesFor` (new 5-role list, side-relative labels).
- `src/lib/dal/cap-table.ts` — `applyCapTableVisibilityGate` (new roles; drop `viewOnlyShadowSide`).
- `src/lib/dal/checklist.ts` — `ownerFilterForSession` / role→owner-side mapping.
- `src/app/api/workspaces/[id]/readiness/route.ts`, `src/app/api/workspaces/[id]/checklist/route.ts`, `src/lib/notifications/enqueue-checklist-assigned.ts` — update role-set references.
- `src/lib/dal/qna.ts` — `createQuestion`/`postMessage` reject `view_only`.
- `src/lib/dal/workstreams.ts` — `addWorkstreamMember` rejects view_only / non-active; the members modal filters too.
- `src/components/workspace/ParticipantFormModal.tsx`, `ParticipantList.tsx`, `WorkstreamMembersModal.tsx` — new role labels/options; active-only member list.
- `src/app/api/workspaces/[id]/participants/route.ts`, `.../[pid]/route.ts` — role validation against the new set.
- `src/components/workspace/WorkspaceShell.tsx`, `src/app/(app)/workspace/[workspaceId]/page.tsx`, `DealOverview.tsx` — remove the Client-required banner + `activeClientCount` prop/usage.
- `src/db/schema.ts` — retire `viewOnlyShadowSide` (stop using; migration drops the column).

**Create:**
- `src/db/migrations/0018_role_model.sql`, `scripts/apply-0018-direct.mjs`.

---

## Task 1: Enum + types + role labels (foundation, typecheck-green)

**Files:** `src/db/schema.ts`, `src/types/index.ts`, `src/lib/dal/permissions.ts`, `src/lib/participants/roles.ts`; test `src/test/lib/roles.test.ts` (create if absent).

**Interfaces:**
- Produces: `ParticipantRole` includes `'client_counsel' | 'counterparty'`; `roleLabel(role, side)` returns labels for the new roles; deprecated roles still compile.

- [ ] **Step 1: Add enum values** — in `schema.ts` `participantRoleEnum`, add `'client_counsel'` and `'counterparty'` (after `'counterparty'`/near the others); add a comment marking `seller_rep`/`buyer_rep`/`seller_counsel`/`buyer_counsel`/`counsel` as deprecated.

- [ ] **Step 2: Add to both `ParticipantRole` unions** — append `| 'client_counsel' | 'counterparty'` to the union in BOTH `src/types/index.ts` and `src/lib/dal/permissions.ts`. Keep deprecated members (needed until migration + for old rows).

- [ ] **Step 3: Write failing test for `roleLabel`** — `src/test/lib/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleLabel, assignableRolesFor } from '@/lib/participants/roles';

describe('roleLabel', () => {
  it('labels new side-relative roles', () => {
    expect(roleLabel('client', 'seller_side')).toBe('Client');
    expect(roleLabel('client_counsel', 'seller_side')).toBe('Client Counsel');
    expect(roleLabel('counterparty', 'seller_side')).toBe('Counterparty');
    expect(roleLabel('cis_team', 'seller_side')).toBe('CIS Team');
    expect(roleLabel('view_only', 'seller_side')).toBe('View-only');
  });
});

describe('assignableRolesFor', () => {
  it('offers exactly the 5 active roles + admin, no deprecated', () => {
    const vals = assignableRolesFor('seller_side').map((r) => r.value);
    expect(vals).toEqual(['admin', 'cis_team', 'client', 'client_counsel', 'counterparty', 'view_only']);
    expect(vals).not.toContain('seller_rep');
    expect(vals).not.toContain('buyer_counsel');
  });
});
```

- [ ] **Step 4: Run test → FAIL.** Run: `npx vitest run src/test/lib/roles.test.ts`.

- [ ] **Step 5: Update `roles.ts`** — `roleLabel` adds cases for `client_counsel` → `'Client Counsel'`, `counterparty` → `'Counterparty'`; change `view_only` label to `'View-only'`; KEEP the deprecated cases (they still exist in the union, so the exhaustive switch needs them). `assignableRolesFor(side)` returns the new active set only:

```ts
export function assignableRolesFor(side: CisAdvisorySide): Array<{ value: ParticipantRole; label: string }> {
  const roles: ParticipantRole[] = ['admin', 'cis_team', 'client', 'client_counsel', 'counterparty', 'view_only'];
  return roles.map((value) => ({ value, label: roleLabel(value, side) }));
}
```

(Optional: `roleLabel` may append a side suffix for `client`/`counterparty` — e.g. `Client (Seller)` on a sell-side deal — if desired; keep base labels for v1 to keep the test simple.)

- [ ] **Step 6: Run test → PASS;** `npm run typecheck` → PASS (the exhaustive switch now covers all union members).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(roles): add client_counsel + counterparty roles, labels, assignable set"`

---

## Task 2: `canPerform` — upload restricted to CIS/Client/Counsel

**Files:** `src/lib/dal/permissions.ts`; test `src/test/dal/permissions.test.ts` (create).

**Interfaces:** `canPerform(role, action)` — `upload` true only for `admin`/`cis_team`/`client`/`client_counsel`; `download` true for any role (folder gate handles access); `view_only`/`counterparty` cannot upload.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { canPerform } from '@/lib/dal/permissions';
describe('canPerform', () => {
  it('upload only for CIS/Client/Client Counsel/Admin', () => {
    for (const r of ['admin','cis_team','client','client_counsel'] as const) expect(canPerform(r,'upload')).toBe(true);
    for (const r of ['counterparty','view_only'] as const) expect(canPerform(r,'upload')).toBe(false);
  });
  it('download for everyone (folder gate handles access)', () => {
    for (const r of ['admin','cis_team','client','client_counsel','counterparty','view_only'] as const) expect(canPerform(r,'download')).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
const UPLOAD_ROLES: ReadonlySet<ParticipantRole> = new Set(['admin', 'cis_team', 'client', 'client_counsel']);
export function canPerform(role: ParticipantRole, action: FolderAction): boolean {
  if (action === 'upload') return UPLOAD_ROLES.has(role);
  return true; // download: any role with folder access
}
```

- [ ] **Step 4: Run → PASS;** typecheck.

- [ ] **Step 5: Commit** — `git commit -am "feat(roles): canPerform upload limited to CIS/Client/Client Counsel"`

---

## Task 3: Cap-table visibility gate for new roles (drop shadow side)

**Files:** `src/lib/dal/cap-table.ts`; `src/test/dal/cap-table.test.ts` (extend existing).

**Interfaces:** `applyCapTableVisibilityGate(ct, scope)` — visible=true for `admin`/`cis_team`/`client`/`client_counsel`; for `counterparty` and `view_only`, visible only when `ct.status === 'published'`. No `viewOnlyShadowSide` usage.

- [ ] **Step 1: Update the test** — replace shadow-side cases with: client_counsel→always visible; counterparty→visible only if published; view_only→visible only if published.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — replace the body:

```ts
const FULL_VIEW_ROLES: ReadonlySet<ParticipantRole> = new Set(['admin', 'cis_team', 'client', 'client_counsel']);
export function applyCapTableVisibilityGate(ct: CapTableSummary, scope: SessionScope): { visible: boolean } {
  if (scope.isAdmin) return { visible: true };
  if (FULL_VIEW_ROLES.has(scope.role)) return { visible: true };
  // counterparty, view_only, and any deprecated/unknown role: published only
  return { visible: ct.status === 'published' };
}
```

Remove `shadowSide` from `SessionScope` usage here (and stop passing it from the cap-table route — it can keep resolving it but ignore it, or drop it; the route change is part of this task). Drop `SELLER_SIDE_ROLES`.

- [ ] **Step 4: Run → PASS;** typecheck (fix the cap-table route + GET handler that build `scope` to no longer require `shadowSide`).

- [ ] **Step 5: Commit** — `git commit -am "feat(roles): cap-table visibility by new roles (published-only for counterparty/view-only)"`

---

## Task 4: Checklist owner filter + readiness/role-set references

**Files:** `src/lib/dal/checklist.ts`, `src/app/api/workspaces/[id]/readiness/route.ts`, `src/app/api/workspaces/[id]/checklist/route.ts`, `src/lib/notifications/enqueue-checklist-assigned.ts`; extend `src/test/dal/*checklist*` tests as needed.

**Interfaces:** `ownerFilterForSession` maps the new roles to checklist owner sides: CIS/admin → all; `client`/`client_counsel` → the client's owner side (seller on sell-side, buyer on buy-side — derived from `cisAdvisorySide`); `counterparty` → the other side; `view_only` → null (sees none / read-only).

- [ ] **Step 1: Read `checklist.ts` `ownerFilterForSession`** to see the current role→owner mapping and the `ChecklistOwner` values (`seller|buyer|both|cis_team|unassigned`).

- [ ] **Step 2: Update the mapping** — replace old role branches with the new roles, deriving owner side from `cisAdvisorySide`. Example shape (adapt to the real fn):

```ts
// CIS/admin: see all owners. client/client_counsel: client side. counterparty: other side. view_only: none.
function clientOwnerSide(side: CisAdvisorySide): ChecklistOwner { return side === 'seller_side' ? 'seller' : 'buyer'; }
function otherOwnerSide(side: CisAdvisorySide): ChecklistOwner { return side === 'seller_side' ? 'buyer' : 'seller'; }
```
Map: `admin`/`cis_team` → null filter (all); `client`/`client_counsel` → [clientOwnerSide(side), 'both']; `counterparty` → [otherOwnerSide(side), 'both']; `view_only` → [] (none). Keep deprecated roles mapping to a safe default (treat like their migrated target or 'none').

- [ ] **Step 3: Update the role-set references** in `readiness/route.ts`, `checklist/route.ts`, `enqueue-checklist-assigned.ts` — anywhere an old role name (`seller_rep` etc.) is referenced, switch to the new roles (or the derived owner side). Read each, replace.

- [ ] **Step 4: Run the checklist tests + typecheck → PASS.**

- [ ] **Step 5: Commit** — `git commit -am "feat(roles): checklist owner filter + readiness use new role model"`

---

## Task 5: Q&A ask-gate + workstream membership eligibility (active, non-view-only)

**Files:** `src/lib/dal/qna.ts`, `src/lib/dal/workstreams.ts`; tests `src/lib/dal/qna.test.ts`, `src/lib/dal/workstreams.test.ts`.

**Interfaces:** `createQuestion`/`postMessage` throw `'Forbidden'` for a `view_only` caller. `addWorkstreamMember` throws if the target participant is not active or is `view_only`.

- [ ] **Step 1: Failing tests** — (a) `createQuestion` by a view_only participant rejects; (b) `addWorkstreamMember` for an inactive or view_only participant rejects.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `createQuestion`/`postMessage`: resolve the caller's participant role (or pass it from the route) and reject `view_only`. `addWorkstreamMember`: look up the target `workspace_participants` row; throw `'Forbidden'`/`'Invalid participant'` unless `status === 'active'` and `role !== 'view_only'`.

- [ ] **Step 4: Run → PASS;** typecheck.

- [ ] **Step 5: Commit** — `git commit -am "feat(roles): view-only cannot ask Q&A; workstream members must be active non-view-only"`

---

## Task 6: Member/participant UI — new roles + active-only members

**Files:** `src/components/workspace/ParticipantFormModal.tsx`, `ParticipantList.tsx`, `WorkstreamMembersModal.tsx`; participant routes `src/app/api/workspaces/[id]/participants/route.ts`, `.../[pid]/route.ts`.

- [ ] **Step 1: Invite/edit options** — `ParticipantFormModal` uses `assignableRolesFor(side)` (Task 1) for its role `<select>`; remove any hardcoded old-role options.
- [ ] **Step 2: Role validation** — the participant POST/PATCH routes validate the submitted role against the new active set (`assignableRolesFor` values); reject deprecated/unknown with 400.
- [ ] **Step 3: Labels** — `ParticipantList` renders `roleLabel(role, side)` (it likely already does; confirm it passes the workspace side).
- [ ] **Step 4: Members modal active-only** — `WorkstreamMembersModal` filters the participant list to `status === 'active' && role !== 'view_only'` (so non-accepted invitees and observers can't be selected). Show a short note for excluded ones if trivial, else just omit.
- [ ] **Step 5: Verify** — `npm run typecheck && npm test` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(roles): invite/member UI uses new roles; members modal active-only"`

---

## Task 7: Remove the Client-required banner

**Files:** `src/components/workspace/WorkspaceShell.tsx`, `src/app/(app)/workspace/[workspaceId]/page.tsx`, `src/components/workspace/DealOverview.tsx`.

- [ ] **Step 1: Remove the banner** — delete the `activeClientCount === 0` `<Banner>` block in `WorkspaceShell.tsx` and the `activeClientCount` prop. Remove the `countActiveClientParticipants` call + prop threading in `page.tsx`. If `countActiveClientParticipants` is now unused anywhere, delete it from `participants.ts`; if `DealOverview` uses `activeClientCount`, remove that usage too.
- [ ] **Step 2: Verify** — `npm run typecheck && npm test && npm run build` → PASS (no dangling refs).
- [ ] **Step 3: Commit** — `git commit -am "feat(roles): remove Client-required banner + activeClientCount plumbing"`

---

## Task 8: Migration 0018 — backfill roles + retire shadow side

**Files:** `src/db/schema.ts` (retire `viewOnlyShadowSide`), `src/db/migrations/0018_role_model.sql`, `scripts/apply-0018-direct.mjs`.

- [ ] **Step 1: Hand-write `0018_role_model.sql`** (format like `0016_workstreams.sql`): `ALTER TYPE participant_role ADD VALUE IF NOT EXISTS 'client_counsel'` and `'counterparty'`; the side-aware `UPDATE` backfill (below); optional `ALTER TABLE workspace_participants DROP COLUMN IF EXISTS view_only_shadow_side`.

- [ ] **Step 2: Write `apply-0018-direct.mjs`** (style of `apply-0016-direct.mjs`, idempotent). Backfill, joining each participant to its workspace's `cis_advisory_side`:

```sql
-- seller_rep
UPDATE workspace_participants p SET role = (CASE WHEN w.cis_advisory_side='seller_side' THEN 'client' ELSE 'counterparty' END)::participant_role
  FROM workspaces w WHERE w.id = p.workspace_id AND p.role = 'seller_rep';
-- buyer_rep
UPDATE workspace_participants p SET role = (CASE WHEN w.cis_advisory_side='buyer_side' THEN 'client' ELSE 'counterparty' END)::participant_role
  FROM workspaces w WHERE w.id = p.workspace_id AND p.role = 'buyer_rep';
-- seller_counsel
UPDATE workspace_participants p SET role = (CASE WHEN w.cis_advisory_side='seller_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
  FROM workspaces w WHERE w.id = p.workspace_id AND p.role = 'seller_counsel';
-- buyer_counsel
UPDATE workspace_participants p SET role = (CASE WHEN w.cis_advisory_side='buyer_side' THEN 'client_counsel' ELSE 'counterparty' END)::participant_role
  FROM workspaces w WHERE w.id = p.workspace_id AND p.role = 'buyer_counsel';
-- deprecated counsel → view_only (least privilege)
UPDATE workspace_participants SET role = 'view_only' WHERE role = 'counsel';
```

- [ ] **Step 3: Verify section** in the apply script: assert `SELECT count(*) FROM workspace_participants WHERE role IN ('seller_rep','buyer_rep','seller_counsel','buyer_counsel','counsel')` is **0**; print per-role counts; exit non-zero on failure.

- [ ] **Step 4: Retire `viewOnlyShadowSide`** in `schema.ts` — remove the column from the `workspaceParticipants` table definition (the migration drops it). Ensure no code still reads it (Task 3 already removed the cap-table usage; grep `viewOnlyShadowSide` to confirm none remain).

- [ ] **Step 5: Apply locally** — `node --env-file=.env.local scripts/apply-0018-direct.mjs` → `All checks passed.`

- [ ] **Step 6: Verify** — `npm run typecheck && npm test` → PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(roles): migration 0018 — backfill roles side-aware, retire shadow side"`

---

## Task 9: Verify + PR

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → all PASS.
- [ ] **Step 2:** Grep for any remaining deprecated-role references in `src` (excluding `migrations/meta` snapshots and the dormant enum/label cases) — should be only the deprecation comments + `roleLabel` deprecated cases.
- [ ] **Step 3:** Push `feat/role-model`; open PR summarizing the new model + permission matrix + migration. **Note in the PR:** apply `0018` to preview before testing and to production at merge (separate DBs). Final whole-branch review must confirm no authorization over-grant.

---

## Self-Review Notes (for the executor)
- **Spec coverage:** 5 roles + side-derivation ✓ (T1), permission matrix ✓ (T2 upload / T3 cap-table / T4 checklist / T5 Q&A+membership / existing isCisTeamOrAdmin for manage), migration ✓ (T8), shadow-side retire ✓ (T3/T8), banner removal ✓ (T7), invite/member UI ✓ (T6). Deferred: dashboard-counts bug (Phase 3) — NOT here.
- **Coupling:** Task 1 must keep `roleLabel`'s exhaustive switch covering deprecated members (they remain in the union) — do not delete them from the union, only from the assignable/active set.
- **Two `ParticipantRole` defs** (types/index.ts + permissions.ts) — both updated in Task 1; if they drift, typecheck across modules will catch it.
- **Authorization risk:** every gate change (upload, cap-table, Q&A, membership) must DENY by default for unknown/deprecated roles — the implementations above fall through to least privilege. Final review verifies no over-grant.
- **Migration is side-aware** — backfill must JOIN to `workspaces.cis_advisory_side`; a plain role swap would mis-assign sides.
