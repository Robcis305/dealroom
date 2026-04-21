# Diligence Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the per-workspace diligence checklist feature described in [docs/superpowers/specs/2026-04-21-diligence-checklist-design.md](../specs/2026-04-21-diligence-checklist-design.md): Excel import, per-role filtered view, click-to-upload with auto-linking, admin inline editing.

**Architecture:** Three new tables (`checklists`, `checklist_items`, `checklist_item_files`) + three new enums + additions to `participant_role` and `activity_action`. Rendered as a pinned sidebar entry in the existing `WorkspaceShell` that routes the center panel to a new `ChecklistView`. Uploads via item-click reuse `UploadModal` with a new optional "Link to checklist item" field; uploads via folder-click see the same field with a filtered dropdown. The existing `notification_queue` carries the one new `checklist_item_assigned` event.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM + Neon Postgres, Vitest + jsdom, `xlsx` (SheetJS CE — already in `package.json`), Tailwind CSS 4, `lucide-react` icons, `sonner` for toasts.

**Working conventions:**
- Run migrations with: `cd cis-deal-room && set -a && source .env.local && set +a && npx drizzle-kit migrate`
- Run tests with: `cd cis-deal-room && npm test`
- Type-check with: `cd cis-deal-room && npm run typecheck`
- All work on a single branch (e.g., `feat/diligence-checklist`). Don't commit to `main`. PR is opened after implementation is complete. Rob previews on Vercel before squash-merge.
- Tests mock `@/db` globally via `src/test/setup.ts`. Existing patterns in `src/test/dal/*.test.ts` show the mocking shape.

**Scope out (from spec §"Non-goals"):** template download, CSV import, multi-checklist UI, DealOverview integration, row reordering, version follow-through, Received/Waived notifications.

---

## Phase 0 — Branch setup

### Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to branch**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git checkout -b feat/diligence-checklist
```

- [ ] **Step 2: Stage the spec + this plan and commit**

```bash
git add docs/superpowers/specs/2026-04-21-diligence-checklist-design.md \
        docs/superpowers/plans/2026-04-21-diligence-checklist.md
git commit -m "docs: add diligence checklist design + plan"
```

Leave the branch unpushed until phase 1 is done — first push opens a noisy preview URL.

---

## Phase 1 — Schema, types, permissions

Three migrations, schema update, TypeScript types, permission function update. All changes must keep the existing `counsel` enum value (deprecated but still supported for existing rows).

### Task 1: Add checklist enum types in `schema.ts`

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts`

- [ ] **Step 1: Add three new enums above the `// ─── Tables ───` separator**

Add after line 63 (inside the Enums section) of [cis-deal-room/src/db/schema.ts](cis-deal-room/src/db/schema.ts):

```typescript
export const checklistPriorityEnum = pgEnum('checklist_priority', [
  'critical',
  'high',
  'medium',
  'low',
]);

export const checklistOwnerEnum = pgEnum('checklist_owner', [
  'seller',
  'buyer',
  'both',
  'cis_team',
  'unassigned',
]);

export const checklistStatusEnum = pgEnum('checklist_status', [
  'not_started',
  'in_progress',
  'received',
  'waived',
  'n_a',
]);
```

- [ ] **Step 2: Add `seller_counsel` and `buyer_counsel` to the existing `participantRoleEnum`**

Find `participantRoleEnum` at [cis-deal-room/src/db/schema.ts:29-37](cis-deal-room/src/db/schema.ts#L29-L37) and change it to:

```typescript
export const participantRoleEnum = pgEnum('participant_role', [
  'admin',
  'cis_team',
  'client',
  'counsel',          // deprecated — kept for existing rows; not offered in new-invite UI
  'buyer_rep',
  'seller_rep',
  'view_only',
  'seller_counsel',
  'buyer_counsel',
]);
```

- [ ] **Step 3: Add six new values to `activityActionEnum`**

Find `activityActionEnum` at [cis-deal-room/src/db/schema.ts:39-54](cis-deal-room/src/db/schema.ts#L39-L54) and append these values (in this order, at the end of the list):

```typescript
'checklist_imported',
'checklist_item_linked',
'checklist_item_received',
'checklist_item_waived',
'checklist_item_na',
'checklist_item_assigned',
```

### Task 2: Add `viewOnlyShadowSide` column and create new tables in `schema.ts`

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts`

- [ ] **Step 1: Add a shadow-side pgEnum**

Above the Tables section, below the enums you added in Task 1, add:

```typescript
export const viewOnlyShadowSideEnum = pgEnum('view_only_shadow_side', [
  'buyer',
  'seller',
]);
```

- [ ] **Step 2: Add `viewOnlyShadowSide` column to `workspaceParticipants`**

Find `workspaceParticipants` at [cis-deal-room/src/db/schema.ts:112-124](cis-deal-room/src/db/schema.ts#L112-L124) and add a new column before the closing brace:

```typescript
viewOnlyShadowSide: viewOnlyShadowSideEnum('view_only_shadow_side'),
```

The column is nullable at the DB level. App-level invariant ("required iff role = 'view_only'") is enforced in the DAL and form validation, not in Postgres — reason: the existing `role` enum has values that coexist independently, and a composite check constraint would complicate the enum-value additions we just did.

- [ ] **Step 3: Add `checklists` table definition**

At the end of the file (after `notificationQueue`), add:

```typescript
export const checklists = pgTable('checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Diligence Checklist'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

- [ ] **Step 4: Add `checklistItems` table definition**

After `checklists`:

```typescript
export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id')
    .notNull()
    .references(() => checklists.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id')
    .notNull()
    .references(() => folders.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
  category: text('category').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  priority: checklistPriorityEnum('priority').notNull().default('medium'),
  owner: checklistOwnerEnum('owner').notNull().default('unassigned'),
  status: checklistStatusEnum('status').notNull().default('not_started'),
  notes: text('notes'),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  receivedAt: timestamp('received_at'),
  receivedBy: uuid('received_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

Note: `folderId` uses `onDelete: 'restrict'` so Postgres blocks folder deletion while referenced — belt-and-suspenders alongside the app-level guard in Task 11.

- [ ] **Step 5: Add `checklistItemFiles` join table**

After `checklistItems`:

```typescript
export const checklistItemFiles = pgTable(
  'checklist_item_files',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => checklistItems.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    linkedAt: timestamp('linked_at').notNull().defaultNow(),
    linkedBy: uuid('linked_by').notNull().references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.fileId] })],
);
```

Update the drizzle-orm/pg-core import at the top of the file to include `primaryKey`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
```

### Task 3: Generate and apply the migration

**Files:**
- Create: `cis-deal-room/src/db/migrations/0006_<slug>.sql` (slug auto-generated by drizzle-kit)

- [ ] **Step 1: Generate the migration**

```bash
cd "/Users/robertlevin/development/Deal Rooms/cis-deal-room"
set -a && source .env.local && set +a
npx drizzle-kit generate
```

Expected: a new file in `src/db/migrations/` numbered `0006_*.sql` with `CREATE TYPE`, `ALTER TYPE`, `CREATE TABLE`, and `ALTER TABLE` statements covering all changes from Tasks 1-2.

- [ ] **Step 2: Inspect the generated SQL**

Open the new `0006_*.sql` file. Verify it contains:

- `CREATE TYPE "public"."checklist_priority" AS ENUM (...)` (three new types)
- `ALTER TYPE "public"."participant_role" ADD VALUE 'seller_counsel'` and `'buyer_counsel'`
- `ALTER TYPE "public"."activity_action" ADD VALUE '...'` (six new values)
- `CREATE TYPE "public"."view_only_shadow_side" AS ENUM (...)`
- `ALTER TABLE "workspace_participants" ADD COLUMN "view_only_shadow_side"`
- `CREATE TABLE "checklists"`, `"checklist_items"`, `"checklist_item_files"`

If any of those are missing, the schema.ts edits are incomplete — go back to Task 1/2, fix, and re-generate (delete the bad 0006 file first).

- [ ] **Step 3: Apply the migration against Neon**

```bash
npx drizzle-kit migrate
```

Expected: one success line per SQL statement. No errors.

- [ ] **Step 4: Smoke-test via psql (optional but recommended)**

```bash
psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::participant_role));"
```

Expected output includes `seller_counsel` and `buyer_counsel`.

```bash
psql "$DATABASE_URL" -c "\\d checklist_items"
```

Expected: table exists with the columns from Task 2 Step 4.

### Task 4: Update TypeScript types in `src/types/index.ts`

**Files:**
- Modify: `cis-deal-room/src/types/index.ts`

- [ ] **Step 1: Replace the `ParticipantRole` union**

At [cis-deal-room/src/types/index.ts:26-33](cis-deal-room/src/types/index.ts#L26-L33), change to:

```typescript
export type ParticipantRole =
  | 'admin'
  | 'cis_team'
  | 'client'
  | 'counsel'          // deprecated — not offered in new-invite UI
  | 'buyer_rep'
  | 'seller_rep'
  | 'view_only'
  | 'seller_counsel'
  | 'buyer_counsel';
```

- [ ] **Step 2: Append new `ActivityAction` values**

At [cis-deal-room/src/types/index.ts:41-55](cis-deal-room/src/types/index.ts#L41-L55), append these six values at the end of the union:

```typescript
  | 'checklist_imported'
  | 'checklist_item_linked'
  | 'checklist_item_received'
  | 'checklist_item_waived'
  | 'checklist_item_na'
  | 'checklist_item_assigned';
```

- [ ] **Step 3: Add new checklist-specific types**

At the bottom of the file, append:

```typescript
// ─── Checklist ────────────────────────────────────────────────────────────────

export type ChecklistPriority = 'critical' | 'high' | 'medium' | 'low';

export type ChecklistOwner =
  | 'seller'
  | 'buyer'
  | 'both'
  | 'cis_team'
  | 'unassigned';

export type ChecklistStatus =
  | 'not_started'
  | 'in_progress'
  | 'received'
  | 'waived'
  | 'n_a';

export type ViewOnlyShadowSide = 'buyer' | 'seller';
```

- [ ] **Step 4: Mirror the `ParticipantRole` change in `src/lib/dal/permissions.ts`**

At [cis-deal-room/src/lib/dal/permissions.ts:1-8](cis-deal-room/src/lib/dal/permissions.ts#L1-L8), replace the local `ParticipantRole` to match (including new values).

- [ ] **Step 5: Typecheck**

```bash
cd cis-deal-room && npm run typecheck
```

Expected: no new errors. If the typecheck fails elsewhere in the codebase due to exhaustive switches over `ParticipantRole` or `ActivityAction`, fix them as you encounter them (usually by adding a default branch or handling the new values). Note which files you touched.

### Task 5: Commit Phase 1

- [ ] **Step 1: Stage only the Phase 1 files**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/db/schema.ts \
        cis-deal-room/src/db/migrations/0006_*.sql \
        cis-deal-room/src/db/migrations/meta \
        cis-deal-room/src/types/index.ts \
        cis-deal-room/src/lib/dal/permissions.ts
# Also stage any files you had to touch in Task 4 Step 5
git status
```

Inspect the listed files; make sure nothing unrelated is staged.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(db): add checklist schema + role/activity enum additions"
```

---

## Phase 2 — Participant invite UI: new roles + shadow side

### Task 6: Add the new `counsel` roles and `view_only` shadow-side field to `ParticipantFormModal`

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ParticipantFormModal.tsx`
- Read first: same file (to understand current form state)

- [ ] **Step 1: Read the current modal to understand role options + submit payload**

```bash
cat cis-deal-room/src/components/workspace/ParticipantFormModal.tsx
```

Note: how `role` is selected (probably a `<select>` with hardcoded options), what fields are submitted, and where the body is POSTed.

- [ ] **Step 2: Update the role options list**

Find the `<option>` elements for roles. Add two new entries after the existing `counsel` option (keeping `counsel` itself *out* of the selectable options — it remains in the type union for backward compat but is no longer offered):

```tsx
<option value="seller_counsel">Seller Counsel</option>
<option value="buyer_counsel">Buyer Counsel</option>
```

Remove the existing `<option value="counsel">Counsel</option>` line. Existing rows with `role = 'counsel'` remain in the DB; admins will manually reassign them (per spec).

- [ ] **Step 3: Add shadow-side state and conditional field**

Add local state:

```tsx
const [viewOnlyShadowSide, setViewOnlyShadowSide] = useState<'buyer' | 'seller' | ''>('');
```

After the role `<select>`, add a conditional block — rendered only when `role === 'view_only'`:

```tsx
{role === 'view_only' && (
  <div className="mt-3">
    <label className="block text-xs font-medium text-text-secondary mb-1">
      View as (required)
    </label>
    <select
      value={viewOnlyShadowSide}
      onChange={(e) => setViewOnlyShadowSide(e.target.value as 'buyer' | 'seller' | '')}
      className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-sm text-text-primary"
      required
    >
      <option value="">Select…</option>
      <option value="buyer">Buyer side</option>
      <option value="seller">Seller side</option>
    </select>
  </div>
)}
```

- [ ] **Step 4: Include `viewOnlyShadowSide` in the submit payload**

Wherever the form POSTs (find the `fetch`/`fetchWithAuth` call inside the submit handler), add to the JSON body:

```typescript
viewOnlyShadowSide: role === 'view_only' ? viewOnlyShadowSide : null,
```

- [ ] **Step 5: Guard the submit when `view_only` is selected without a shadow side**

Before calling `fetchWithAuth`, add:

```typescript
if (role === 'view_only' && !viewOnlyShadowSide) {
  // Display inline error — reuse whatever error-surfacing pattern the rest of
  // the modal uses (often a setError call). Prevent submission.
  return;
}
```

- [ ] **Step 6: Manual verification**

```bash
cd cis-deal-room && npm run dev
```

Open a workspace, click Invite, verify:
- Counsel no longer appears in dropdown
- Seller Counsel / Buyer Counsel appear
- Selecting View Only reveals "View as" dropdown
- Submitting View Only without picking a side is blocked

Leave the dev server running for the next tasks.

### Task 7: Update invite + update DAL to accept shadow side

**Files:**
- Modify: `cis-deal-room/src/lib/dal/participants.ts`
- Test: `cis-deal-room/src/test/dal/participants.test.ts` (extend existing)

- [ ] **Step 1: Update `InviteInput` and `UpdateInput` interfaces**

At [cis-deal-room/src/lib/dal/participants.ts:45-55](cis-deal-room/src/lib/dal/participants.ts#L45-L55) add to both interfaces:

```typescript
viewOnlyShadowSide?: 'buyer' | 'seller' | null;
```

- [ ] **Step 2: Add a shared validator**

At the top of the file (after the `Tx` type alias), add:

```typescript
function validateShadowSide(
  role: ParticipantRole,
  shadowSide: 'buyer' | 'seller' | null | undefined,
): 'buyer' | 'seller' | null {
  if (role === 'view_only') {
    if (shadowSide !== 'buyer' && shadowSide !== 'seller') {
      throw new Error('view_only role requires viewOnlyShadowSide');
    }
    return shadowSide;
  }
  // For any other role, ignore whatever was passed and store null.
  return null;
}
```

- [ ] **Step 3: Call the validator inside `inviteParticipant` and `updateParticipant`**

In `inviteParticipant` (before the transaction), add:

```typescript
const shadowSide = validateShadowSide(input.role, input.viewOnlyShadowSide ?? null);
```

Include `viewOnlyShadowSide: shadowSide` in:
- The `tx.insert(workspaceParticipants).values({...})` call
- The role-change `tx.update(workspaceParticipants).set({ role: input.role, viewOnlyShadowSide: shadowSide }).where(...)` call (the existing re-invite path that updates the role on an existing row must also update shadow side when role changes)

In `updateParticipant`, add the same `validateShadowSide` call and include the field in the `tx.update().set(...)` call.

- [ ] **Step 4: Write failing tests**

In `cis-deal-room/src/test/dal/participants.test.ts`, add tests to the existing describe block:

```typescript
describe('validateShadowSide via inviteParticipant', () => {
  it('throws when role=view_only and shadow side is missing', async () => {
    // Arrange session mock to be admin (reuse existing patterns)
    // Act + assert:
    await expect(
      inviteParticipant({
        workspaceId: 'ws-1',
        email: 'viewer@example.com',
        role: 'view_only',
        folderIds: [],
        viewOnlyShadowSide: null,
      }),
    ).rejects.toThrow(/view_only role requires viewOnlyShadowSide/);
  });

  it('stores shadow side when role=view_only and side is provided', async () => {
    // Mock chain to capture insert values; expect viewOnlyShadowSide: 'seller'
  });

  it('forces shadow side to null when role != view_only', async () => {
    // Invite with role='seller_rep' and viewOnlyShadowSide='buyer' —
    // insert should have viewOnlyShadowSide: null
  });
});
```

Fill in the mock setup following the patterns at the top of the existing test file.

- [ ] **Step 5: Run the tests, see them fail**

```bash
cd cis-deal-room && npm test -- participants
```

Expected: three new tests fail because the DAL changes haven't been exercised end-to-end through the mocks yet. Iterate the mock setup until the first test (the throw case) passes — this validates the validator itself.

- [ ] **Step 6: Fix mocks so all three pass**

- [ ] **Step 7: Typecheck and full test run**

```bash
npm run typecheck && npm test
```

Expected: clean.

### Task 8: API route for invite — accept `viewOnlyShadowSide` from request body

**Files:**
- Modify: existing invite endpoint (likely `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts` or a nested `invite` route; locate via `grep -r inviteParticipant cis-deal-room/src/app/api/`)

- [ ] **Step 1: Locate the route**

```bash
grep -rn "inviteParticipant\b" cis-deal-room/src/app/api/
```

- [ ] **Step 2: Update the request schema (zod)**

Add to the body schema:

```typescript
viewOnlyShadowSide: z.enum(['buyer', 'seller']).nullable().optional(),
```

- [ ] **Step 3: Pass the field through to the DAL call**

```typescript
await inviteParticipant({
  workspaceId,
  email: parsed.data.email,
  role: parsed.data.role,
  folderIds: parsed.data.folderIds,
  viewOnlyShadowSide: parsed.data.viewOnlyShadowSide ?? null,
});
```

- [ ] **Step 4: Repeat for the update endpoint** (probably `participants/[pid]/route.ts` PATCH handler)

### Task 9: Commit Phase 2

- [ ] **Step 1: Stage Phase 2 files**

```bash
git add cis-deal-room/src/components/workspace/ParticipantFormModal.tsx \
        cis-deal-room/src/lib/dal/participants.ts \
        cis-deal-room/src/test/dal/participants.test.ts \
        cis-deal-room/src/app/api/workspaces/
git status
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(participants): add seller_counsel/buyer_counsel roles + view_only shadow side"
```

---

## Phase 3 — Checklist DAL (core operations)

All functions live in a new file to keep `workspaces.ts` focused. All write operations log activity in the same transaction (mirrors the `createWorkspace` pattern at [cis-deal-room/src/lib/dal/workspaces.ts:112-144](cis-deal-room/src/lib/dal/workspaces.ts#L112-L144)).

### Task 10: Create checklist DAL skeleton + owner-filter helper

**Files:**
- Create: `cis-deal-room/src/lib/dal/checklist.ts`
- Create: `cis-deal-room/src/test/dal/checklist.test.ts`

- [ ] **Step 1: Write failing test for `ownerFilterForSession`**

In `cis-deal-room/src/test/dal/checklist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ownerFilterForSession } from '@/lib/dal/checklist';

describe('ownerFilterForSession', () => {
  it('returns null for admin (sees all)', () => {
    expect(
      ownerFilterForSession({ isAdmin: true, role: 'admin', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toBeNull();
  });

  it('returns null for cis_team (sees all)', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'cis_team', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toBeNull();
  });

  it('returns [seller, both] for seller_rep', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'seller_rep', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('returns [buyer, both] for buyer_counsel', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'buyer_counsel', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toEqual(['buyer', 'both']);
  });

  it('derives client owner filter from workspace.cisAdvisorySide', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'client', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['buyer', 'both']);
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'client', shadowSide: null, cisAdvisorySide: 'seller_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('uses shadow side for view_only', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'view_only', shadowSide: 'seller', cisAdvisorySide: 'buyer_side' }),
    ).toEqual(['seller', 'both']);
  });

  it('returns empty (no visibility) for deprecated counsel role', () => {
    expect(
      ownerFilterForSession({ isAdmin: false, role: 'counsel', shadowSide: null, cisAdvisorySide: 'buyer_side' }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd cis-deal-room && npm test -- checklist.test
```

Expected: module not found.

- [ ] **Step 3: Create the DAL file with the helper**

`cis-deal-room/src/lib/dal/checklist.ts`:

```typescript
import type { CisAdvisorySide, ChecklistOwner, ParticipantRole, ViewOnlyShadowSide } from '@/types';

interface SessionScope {
  isAdmin: boolean;
  role: ParticipantRole;
  shadowSide: ViewOnlyShadowSide | null;
  cisAdvisorySide: CisAdvisorySide;
}

/**
 * Returns the set of `owner` values this viewer is allowed to see, or `null`
 * for unrestricted (admin/cis_team — sees all rows, including unassigned).
 * Returns `[]` for roles with no visibility (deprecated counsel role).
 */
export function ownerFilterForSession(scope: SessionScope): ChecklistOwner[] | null {
  if (scope.isAdmin || scope.role === 'cis_team' || scope.role === 'admin') {
    return null;
  }

  if (scope.role === 'client') {
    return scope.cisAdvisorySide === 'buyer_side' ? ['buyer', 'both'] : ['seller', 'both'];
  }

  if (scope.role === 'seller_rep' || scope.role === 'seller_counsel') {
    return ['seller', 'both'];
  }
  if (scope.role === 'buyer_rep' || scope.role === 'buyer_counsel') {
    return ['buyer', 'both'];
  }

  if (scope.role === 'view_only') {
    if (scope.shadowSide === 'seller') return ['seller', 'both'];
    if (scope.shadowSide === 'buyer') return ['buyer', 'both'];
    return [];
  }

  // 'counsel' (deprecated) and any unknown role: no visibility until reassigned.
  return [];
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- checklist.test
```

Expected: all 7 tests pass.

### Task 11: DAL — read operations (`getChecklistForWorkspace`, `listItemsForViewer`)

**Files:**
- Modify: `cis-deal-room/src/lib/dal/checklist.ts`
- Modify: `cis-deal-room/src/test/dal/checklist.test.ts`

- [ ] **Step 1: Add imports at top of checklist.ts**

```typescript
import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import {
  checklists,
  checklistItems,
  checklistItemFiles,
  workspaces,
  workspaceParticipants,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
```

- [ ] **Step 2: Implement `getChecklistForWorkspace(workspaceId)`**

```typescript
/** Returns the single checklist row for a workspace, or null. */
export async function getChecklistForWorkspace(workspaceId: string) {
  const [row] = await db
    .select()
    .from(checklists)
    .where(eq(checklists.workspaceId, workspaceId))
    .orderBy(desc(checklists.createdAt))
    .limit(1);
  return row ?? null;
}
```

Note: spec says "one checklist per workspace for MVP" but schema supports many; ordering by desc + limit 1 is forward-compatible.

- [ ] **Step 3: Implement `listItemsForViewer(workspaceId)`**

```typescript
/**
 * Returns all checklist items for the viewer's workspace, filtered by their
 * owner-visibility scope. Admin/cis_team see all (including unassigned).
 * Includes file count per item via a LATERAL subquery.
 */
export async function listItemsForViewer(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error('Workspace not found');

  // Derive the viewer's role/shadow side (admin bypasses, no participant row needed)
  let role: ParticipantRole = 'admin';
  let shadowSide: ViewOnlyShadowSide | null = null;
  if (!session.isAdmin) {
    const [participant] = await db
      .select({
        role: workspaceParticipants.role,
        shadow: workspaceParticipants.viewOnlyShadowSide,
      })
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, workspaceId),
          eq(workspaceParticipants.userId, session.userId),
          eq(workspaceParticipants.status, 'active'),
        ),
      )
      .limit(1);
    if (!participant) throw new Error('Unauthorized');
    role = participant.role;
    shadowSide = participant.shadow;
  }

  const filter = ownerFilterForSession({
    isAdmin: session.isAdmin,
    role,
    shadowSide,
    cisAdvisorySide: workspace.cisAdvisorySide,
  });

  // Empty filter = viewer sees nothing (short-circuit)
  if (filter !== null && filter.length === 0) return [];

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return [];

  const baseQuery = db
    .select({
      id: checklistItems.id,
      sortOrder: checklistItems.sortOrder,
      category: checklistItems.category,
      folderId: checklistItems.folderId,
      name: checklistItems.name,
      description: checklistItems.description,
      priority: checklistItems.priority,
      owner: checklistItems.owner,
      status: checklistItems.status,
      notes: checklistItems.notes,
      requestedAt: checklistItems.requestedAt,
      receivedAt: checklistItems.receivedAt,
    })
    .from(checklistItems)
    .where(
      filter === null
        ? eq(checklistItems.checklistId, checklist.id)
        : and(
            eq(checklistItems.checklistId, checklist.id),
            inArray(checklistItems.owner, filter),
          ),
    )
    .orderBy(checklistItems.sortOrder, checklistItems.category, checklistItems.name);

  return baseQuery;
}
```

- [ ] **Step 4: Update imports in `checklist.ts` to add the two types used above**

Ensure `ParticipantRole` and `ViewOnlyShadowSide` are imported at the top of the file.

- [ ] **Step 5: Add a test that exercises the empty-filter short-circuit** (the rest of `listItemsForViewer` is hard to unit-test with the mock shape; rely on typecheck + integration-level verification)

```typescript
describe('listItemsForViewer', () => {
  it('returns [] immediately when viewer has no visibility', async () => {
    // Mock session: non-admin, role: 'counsel' (deprecated — returns [])
    // Mock workspace lookup to return a row
    // Mock participant lookup to return a row with role 'counsel'
    // Expect result to be []
  });
});
```

- [ ] **Step 6: Run tests and typecheck**

```bash
npm test -- checklist.test && npm run typecheck
```

### Task 12: DAL — write operations (create + edit items)

**Files:**
- Modify: `cis-deal-room/src/lib/dal/checklist.ts`
- Modify: `cis-deal-room/src/test/dal/checklist.test.ts`

- [ ] **Step 1: Add `createChecklist(workspaceId)`**

```typescript
/**
 * Creates the workspace's checklist shell. Admin-only. Logs 'checklist_imported'.
 * Returns the new checklist row.
 */
export async function createChecklist(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(checklists)
      .values({ workspaceId, createdBy: session.userId })
      .returning();

    await logActivity(tx, {
      workspaceId,
      userId: session.userId,
      action: 'checklist_imported',
      targetType: 'workspace',
      targetId: workspaceId,
    });

    return row;
  });

  return created;
}
```

- [ ] **Step 2: Add `createItem` / `updateItem` / `deleteItem`**

```typescript
interface CreateItemInput {
  checklistId: string;
  workspaceId: string;
  folderId: string;
  category: string;
  name: string;
  description?: string | null;
  priority?: ChecklistPriority;
  owner?: ChecklistOwner;
  notes?: string | null;
  sortOrder?: number;
}

export async function createItem(input: CreateItemInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [row] = await db
    .insert(checklistItems)
    .values({
      checklistId: input.checklistId,
      folderId: input.folderId,
      category: input.category,
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 'medium',
      owner: input.owner ?? 'unassigned',
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return row;
}

interface UpdateItemInput {
  name?: string;
  description?: string | null;
  priority?: ChecklistPriority;
  owner?: ChecklistOwner;
  folderId?: string;
  notes?: string | null;
  category?: string;
}

/**
 * Patch an item. Admin-only. Owner transitions from 'unassigned' → a concrete
 * side return a `notifyFor` value so the caller can enqueue notifications.
 */
export async function updateItem(itemId: string, input: UpdateItemInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: checklistItems.id,
      owner: checklistItems.owner,
      checklistId: checklistItems.checklistId,
    })
    .from(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .limit(1);
  if (!existing) throw new Error('Item not found');

  const [updated] = await db
    .update(checklistItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId))
    .returning();

  // Owner assignment signal (for notification)
  let newlyAssignedOwner: ChecklistOwner | null = null;
  if (
    input.owner !== undefined &&
    existing.owner === 'unassigned' &&
    input.owner !== 'unassigned'
  ) {
    newlyAssignedOwner = input.owner;
  }

  return { updated, newlyAssignedOwner };
}

export async function deleteItem(itemId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

### Task 13: DAL — status state machine + link/unlink

**Files:**
- Modify: `cis-deal-room/src/lib/dal/checklist.ts`

- [ ] **Step 1: Add `setItemStatus`**

```typescript
/**
 * Admin-only. Applies the explicit state transition. Terminal states
 * (received/waived/n_a) are set with current timestamp + actor when
 * applicable. 'reset' recomputes from link count (0 → not_started, ≥1 → in_progress).
 */
export async function setItemStatus(
  itemId: string,
  target: ChecklistStatus | 'reset',
): Promise<void> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: checklistItems.id,
        checklistId: checklistItems.checklistId,
        workspaceId: checklists.workspaceId,
        status: checklistItems.status,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(eq(checklistItems.id, itemId))
      .limit(1);
    if (!item) throw new Error('Item not found');

    let nextStatus: ChecklistStatus;
    if (target === 'reset') {
      const [{ count: linkCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(checklistItemFiles)
        .where(eq(checklistItemFiles.itemId, itemId));
      nextStatus = linkCount > 0 ? 'in_progress' : 'not_started';
    } else {
      nextStatus = target;
    }

    const patch: Partial<typeof checklistItems.$inferInsert> = {
      status: nextStatus,
      updatedAt: new Date(),
    };
    if (nextStatus === 'received') {
      patch.receivedAt = new Date();
      patch.receivedBy = session.userId;
    } else {
      patch.receivedAt = null;
      patch.receivedBy = null;
    }

    await tx.update(checklistItems).set(patch).where(eq(checklistItems.id, itemId));

    // Activity
    const actionMap: Record<ChecklistStatus, import('@/types').ActivityAction | null> = {
      received: 'checklist_item_received',
      waived: 'checklist_item_waived',
      n_a: 'checklist_item_na',
      not_started: null,
      in_progress: null,
    };
    const action = actionMap[nextStatus];
    if (action) {
      await logActivity(tx, {
        workspaceId: item.workspaceId,
        userId: session.userId,
        action,
        targetType: 'file',
        targetId: itemId,
      });
    }
  });
}
```

Add `sql` to the drizzle-orm imports at the top: `import { and, eq, inArray, desc, sql } from 'drizzle-orm';`

- [ ] **Step 2: Add `linkFileToItem`**

```typescript
/**
 * Links a file to a checklist item. If the item status is 'not_started' and
 * status is not already a terminal admin-set state, transitions to 'in_progress'.
 * Returns the link row + whether a status transition was made.
 */
export async function linkFileToItem(itemId: string, fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: checklistItems.id,
        checklistId: checklistItems.checklistId,
        workspaceId: checklists.workspaceId,
        status: checklistItems.status,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(eq(checklistItems.id, itemId))
      .limit(1);
    if (!item) throw new Error('Item not found');

    // Upsert link (idempotent)
    await tx
      .insert(checklistItemFiles)
      .values({ itemId, fileId, linkedBy: session.userId })
      .onConflictDoNothing();

    let transitioned = false;
    if (item.status === 'not_started') {
      await tx
        .update(checklistItems)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(checklistItems.id, itemId));
      transitioned = true;
    }

    await logActivity(tx, {
      workspaceId: item.workspaceId,
      userId: session.userId,
      action: 'checklist_item_linked',
      targetType: 'file',
      targetId: fileId,
      metadata: { itemId },
    });

    return { transitioned };
  });
}
```

- [ ] **Step 3: Add `unlinkFileFromItem`**

```typescript
/**
 * Unlinks a file from a checklist item. If 0 links remain and status is
 * 'in_progress', reverts to 'not_started'. Terminal admin-set states
 * (received/waived/n_a) are untouched.
 */
export async function unlinkFileFromItem(itemId: string, fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    await tx
      .delete(checklistItemFiles)
      .where(
        and(
          eq(checklistItemFiles.itemId, itemId),
          eq(checklistItemFiles.fileId, fileId),
        ),
      );

    const [{ count: linkCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(checklistItemFiles)
      .where(eq(checklistItemFiles.itemId, itemId));

    if (linkCount === 0) {
      const [item] = await tx
        .select({ status: checklistItems.status })
        .from(checklistItems)
        .where(eq(checklistItems.id, itemId))
        .limit(1);
      if (item?.status === 'in_progress') {
        await tx
          .update(checklistItems)
          .set({ status: 'not_started', updatedAt: new Date() })
          .where(eq(checklistItems.id, itemId));
      }
    }
  });
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

### Task 14: Commit Phase 3

- [ ] **Step 1: Stage and commit**

```bash
git add cis-deal-room/src/lib/dal/checklist.ts \
        cis-deal-room/src/test/dal/checklist.test.ts
git commit -m "feat(checklist): add DAL for items, linking, status transitions"
```

---

## Phase 4 — Folder delete guard

### Task 15: Block folder deletion when checklist items reference it

**Files:**
- Modify: `cis-deal-room/src/lib/dal/folders.ts` (delete function)

- [ ] **Step 1: Locate the folder delete function**

```bash
grep -n "deleteFolder\|folders.*delete\|onDelete" cis-deal-room/src/lib/dal/folders.ts
```

- [ ] **Step 2: Add a referencing-count check before the delete**

In the delete function, before calling `tx.delete(folders)`:

```typescript
const [{ count: refCount }] = await tx
  .select({ count: sql<number>`count(*)::int` })
  .from(checklistItems)
  .where(eq(checklistItems.folderId, folderId));

if (refCount > 0) {
  throw new Error(`FOLDER_IN_USE: ${refCount} checklist item(s) reference this folder`);
}
```

Import `checklistItems` from `@/db/schema` at the top of the file.

Note: Postgres-level `ON DELETE RESTRICT` (Task 2 Step 4) is the ultimate backstop, but the app-level check produces a clean, translatable error message.

- [ ] **Step 3: Update the folder DELETE API route to surface 409 for this error**

Find the folder delete route (`grep -rn "DELETE" cis-deal-room/src/app/api/workspaces/\[id\]/folders/`). In the catch block, check for the `FOLDER_IN_USE:` prefix and return:

```typescript
if (e instanceof Error && e.message.startsWith('FOLDER_IN_USE:')) {
  return Response.json(
    { error: 'Folder has checklist items. Reassign or delete them first.' },
    { status: 409 },
  );
}
```

- [ ] **Step 4: Add a test that validates the guard**

In `cis-deal-room/src/test/dal/folders.test.ts` (or create if missing), add:

```typescript
it('deleteFolder throws FOLDER_IN_USE when checklist items reference it', async () => {
  // Mock the ref count query to return { count: 3 }
  // Expect rejection with /FOLDER_IN_USE/ message
});
```

- [ ] **Step 5: Run tests, then commit**

```bash
npm test -- folders
git add cis-deal-room/src/lib/dal/folders.ts \
        cis-deal-room/src/app/api/workspaces/
git commit -m "feat(folders): block delete when checklist items reference folder"
```

---

## Phase 5 — Excel import pipeline

### Task 16: Write the Excel parser

**Files:**
- Create: `cis-deal-room/src/lib/checklist/parse-xlsx.ts`
- Create: `cis-deal-room/src/test/lib/parse-xlsx.test.ts`

- [ ] **Step 1: Write failing tests for the parser**

`cis-deal-room/src/test/lib/parse-xlsx.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseChecklistXlsx } from '@/lib/checklist/parse-xlsx';
import * as XLSX from 'xlsx';

function buildSheet(rows: Array<Record<string, string>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

describe('parseChecklistXlsx', () => {
  it('parses valid rows with all columns', () => {
    const buf = buildSheet([
      { '#': '29', Category: 'Legal', Item: 'Corporate Formation Documents',
        Description: 'Articles…', Priority: 'High', Owner: 'Seller', Notes: '' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      sortOrder: 29,
      category: 'Legal',
      name: 'Corporate Formation Documents',
      description: 'Articles…',
      priority: 'high',
      owner: 'seller',
    });
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects rows missing Category', () => {
    const buf = buildSheet([
      { Item: 'Cap Table', Owner: 'Seller' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Category/);
  });

  it('rejects rows missing Item', () => {
    const buf = buildSheet([
      { Category: 'Legal', Owner: 'Seller' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/Item/);
  });

  it('coerces unknown Priority to medium', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Priority: 'Extreme' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].priority).toBe('medium');
  });

  it('coerces unknown Owner to unassigned', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', Owner: 'Whoever' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].owner).toBe('unassigned');
  });

  it('accepts aliases: Description / Request Detail', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'Foo', 'Request Detail': 'body' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].description).toBe('body');
  });

  it('is case-insensitive on headers', () => {
    const buf = buildSheet([
      { category: 'Legal', item: 'Foo' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid).toHaveLength(1);
  });

  it('falls back to row index when # is missing', () => {
    const buf = buildSheet([
      { Category: 'Legal', Item: 'A' },
      { Category: 'Legal', Item: 'B' },
    ]);
    const result = parseChecklistXlsx(buf);
    expect(result.valid[0].sortOrder).toBe(1);
    expect(result.valid[1].sortOrder).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd cis-deal-room && npm test -- parse-xlsx
```

- [ ] **Step 3: Implement the parser**

`cis-deal-room/src/lib/checklist/parse-xlsx.ts`:

```typescript
import * as XLSX from 'xlsx';
import type { ChecklistOwner, ChecklistPriority } from '@/types';

export interface ParsedRow {
  sortOrder: number;
  category: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  notes: string | null;
  requestedAt: Date | null;
}

export interface ParseResult {
  valid: ParsedRow[];
  rejected: Array<{ rowNumber: number; raw: Record<string, string>; reason: string }>;
}

const HEADER_ALIASES: Record<string, string[]> = {
  sortOrder: ['#'],
  category: ['category'],
  name: ['item', 'document', 'request'],
  description: ['description', 'description / request detail', 'request detail'],
  priority: ['priority'],
  owner: ['owner'],
  notes: ['notes'],
  requestedAt: ['date requested', 'requested'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findKey(row: Record<string, unknown>, field: keyof typeof HEADER_ALIASES): string | undefined {
  const aliases = HEADER_ALIASES[field];
  for (const rawKey of Object.keys(row)) {
    const k = normalizeHeader(rawKey);
    if (aliases.includes(k)) return rawKey;
  }
  return undefined;
}

function coercePriority(v: unknown): ChecklistPriority {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

function coerceOwner(v: unknown): ChecklistOwner {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'seller' || s === 'buyer' || s === 'both' || s === 'cis_team') return s;
  if (s === 'cis team' || s === 'cis') return 'cis_team';
  return 'unassigned';
}

export function parseChecklistXlsx(input: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(input, { type: input instanceof ArrayBuffer ? 'array' : 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { valid: [], rejected: [] };
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const valid: ParsedRow[] = [];
  const rejected: ParseResult['rejected'] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // header is row 1

    const categoryKey = findKey(row, 'category');
    const nameKey = findKey(row, 'name');
    const category = categoryKey ? String(row[categoryKey] ?? '').trim() : '';
    const name = nameKey ? String(row[nameKey] ?? '').trim() : '';

    if (!category) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Category' });
      return;
    }
    if (!name) {
      rejected.push({ rowNumber, raw: row as Record<string, string>, reason: 'Missing Item' });
      return;
    }

    const sortKey = findKey(row, 'sortOrder');
    const sortRaw = sortKey ? String(row[sortKey] ?? '').trim() : '';
    const sortNum = Number.parseInt(sortRaw, 10);
    const sortOrder = Number.isFinite(sortNum) ? sortNum : idx + 1;

    const descKey = findKey(row, 'description');
    const notesKey = findKey(row, 'notes');
    const priorityKey = findKey(row, 'priority');
    const ownerKey = findKey(row, 'owner');
    const reqKey = findKey(row, 'requestedAt');

    const description = descKey ? String(row[descKey] ?? '').trim() || null : null;
    const notes = notesKey ? String(row[notesKey] ?? '').trim() || null : null;
    const priority = coercePriority(priorityKey ? row[priorityKey] : undefined);
    const owner = coerceOwner(ownerKey ? row[ownerKey] : undefined);

    let requestedAt: Date | null = null;
    if (reqKey) {
      const raw = row[reqKey];
      if (raw instanceof Date) requestedAt = raw;
      else if (typeof raw === 'string' && raw.trim()) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) requestedAt = d;
      }
    }

    valid.push({ sortOrder, category, name, description, priority, owner, notes, requestedAt });
  });

  return { valid, rejected };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- parse-xlsx
```

### Task 17: Preview + import API routes

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts`
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts`

- [ ] **Step 1: Preview route (no DB writes — just parse + echo)**

`cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts`:

```typescript
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { parseChecklistXlsx } from '@/lib/checklist/parse-xlsx';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
  }

  const buf = await file.arrayBuffer();
  const result = parseChecklistXlsx(buf);
  return Response.json(result);
}
```

- [ ] **Step 2: Import route (does DB writes)**

`cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts`:

```typescript
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { folders, checklistItems } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, createChecklist } from '@/lib/dal/checklist';

const rowSchema = z.object({
  sortOrder: z.number().int(),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  owner: z.enum(['seller', 'buyer', 'both', 'cis_team', 'unassigned']),
  notes: z.string().nullable(),
  requestedAt: z.string().datetime().nullable().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
  }

  // Reject if a checklist already exists (MVP = one per workspace)
  const existing = await getChecklistForWorkspace(workspaceId);
  if (existing) {
    return Response.json({ error: 'Checklist already exists for this workspace' }, { status: 409 });
  }

  const checklist = await createChecklist(workspaceId);

  // Category → folderId resolution with auto-create
  const categories = Array.from(new Set(parsed.data.rows.map((r) => r.category)));
  const existingFolders = await db
    .select({ id: folders.id, name: folders.name, sortOrder: folders.sortOrder })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceId), inArray(folders.name, categories)));

  const nameToId = new Map(existingFolders.map((f) => [f.name, f.id]));
  const missing = categories.filter((c) => !nameToId.has(c));

  if (missing.length > 0) {
    const maxSort = Math.max(0, ...existingFolders.map((f) => f.sortOrder));
    const inserted = await db
      .insert(folders)
      .values(
        missing.map((name, i) => ({
          workspaceId,
          name,
          sortOrder: maxSort + i + 1,
        })),
      )
      .returning({ id: folders.id, name: folders.name });
    inserted.forEach((f) => nameToId.set(f.name, f.id));
  }

  // Bulk insert items
  const values = parsed.data.rows.map((r) => ({
    checklistId: checklist.id,
    folderId: nameToId.get(r.category)!,
    sortOrder: r.sortOrder,
    category: r.category,
    name: r.name,
    description: r.description,
    priority: r.priority,
    owner: r.owner,
    notes: r.notes,
    requestedAt: r.requestedAt ? new Date(r.requestedAt) : new Date(),
  }));
  await db.insert(checklistItems).values(values);

  return Response.json({ checklistId: checklist.id, itemCount: values.length });
}
```

- [ ] **Step 3: Smoke-test the endpoints manually via the UI once Phase 7 lands** (no server test here — parser is already covered; integration is end-to-end in Phase 7 UI)

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

### Task 18: Commit Phase 5

```bash
git add cis-deal-room/src/lib/checklist/parse-xlsx.ts \
        cis-deal-room/src/test/lib/parse-xlsx.test.ts \
        cis-deal-room/src/app/api/workspaces/\[id\]/checklist
git commit -m "feat(checklist): add .xlsx parser + preview/import API routes"
```

---

## Phase 6 — Checklist CRUD + linking API routes

### Task 19: Checklist fetch + single-item CRUD + link/unlink routes

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts` (GET — list items)
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/route.ts` (POST — add)
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/[itemId]/route.ts` (PATCH — update, DELETE)
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/[itemId]/status/route.ts` (PATCH — status transition)
- Create: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/[itemId]/links/route.ts` (POST/DELETE — link/unlink file)

For each route, mirror the pattern in [cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts](cis-deal-room/src/app/api/workspaces/\[id\]/activity/route.ts):

1. Verify session
2. `requireDealAccess`
3. Zod-validate body/query
4. Call DAL function
5. Return `Response.json`

- [ ] **Step 1: GET /checklist — returns `{ checklist, items }`**

```typescript
// route.ts
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, listItemsForViewer } from '@/lib/dal/checklist';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return Response.json({ checklist: null, items: [] });

  const items = await listItemsForViewer(workspaceId);
  return Response.json({ checklist, items });
}
```

- [ ] **Step 2: POST /items — create single item**

```typescript
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, createItem } from '@/lib/dal/checklist';

const schema = z.object({
  folderId: z.string().uuid(),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  owner: z.enum(['seller', 'buyer', 'both', 'cis_team', 'unassigned']).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: workspaceId } = await params;
  try { await requireDealAccess(workspaceId, session); } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) return Response.json({ error: 'No checklist exists' }, { status: 404 });

  const row = await createItem({
    checklistId: checklist.id,
    workspaceId,
    ...parsed.data,
  });
  return Response.json(row, { status: 201 });
}
```

- [ ] **Step 3: PATCH + DELETE /items/[itemId]**

Implement the PATCH route: accepts the same fields as `UpdateItemInput`; calls `updateItem`; if `newlyAssignedOwner` is returned, call `enqueueChecklistAssignedNotifications` (implemented in Phase 8) before responding.

Implement the DELETE route: calls `deleteItem`.

- [ ] **Step 4: PATCH /items/[itemId]/status**

```typescript
const schema = z.object({
  target: z.enum(['not_started', 'in_progress', 'received', 'waived', 'n_a', 'reset']),
});
```

Calls `setItemStatus(itemId, target)`.

- [ ] **Step 5: POST /items/[itemId]/links and DELETE same path**

POST body: `{ fileId: string }` → call `linkFileToItem`.
DELETE body (or `fileId` query param): `{ fileId: string }` → call `unlinkFileFromItem`.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

### Task 20: Commit Phase 6

```bash
git add cis-deal-room/src/app/api/workspaces/\[id\]/checklist
git commit -m "feat(checklist): add CRUD + link API routes"
```

---

## Phase 7 — UI: sidebar entry + import flow

### Task 21: Add "Checklist" pinned entry to `FolderSidebar`

**Files:**
- Modify: `cis-deal-room/src/components/workspace/FolderSidebar.tsx`
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Extend the `WorkspaceShell` selectedView state**

Replace the existing `selectedFolderId: string | null` pattern (at [cis-deal-room/src/components/workspace/WorkspaceShell.tsx:61](cis-deal-room/src/components/workspace/WorkspaceShell.tsx#L61)) with a tagged selection:

```typescript
type CenterView =
  | { kind: 'overview' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'checklist' };

const [view, setView] = useState<CenterView>({ kind: 'overview' });
```

Propagate through `FolderSidebar` and the center-panel switch block (where `DealOverview` / `FileList` are rendered).

- [ ] **Step 2: In `FolderSidebar`, add the pinned Checklist entry above the folder list**

New props:

```typescript
hasChecklist: boolean;
openChecklistCount: number;
selected: CenterView;
onSelect: (view: CenterView) => void;
```

Render the pinned entry between the "Deal overview" button and the folder list:

```tsx
{hasChecklist && (
  <div className="mx-1 mb-1">
    <button
      onClick={() => onSelect({ kind: 'checklist' })}
      className={clsx(
        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors',
        selected.kind === 'checklist'
          ? 'bg-accent-subtle text-accent-on-subtle'
          : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
      )}
    >
      <span className="flex items-center gap-2">
        <ClipboardList size={14} />
        Checklist
      </span>
      {openChecklistCount > 0 && (
        <span className="text-xs font-mono text-text-muted">
          {openChecklistCount} open
        </span>
      )}
    </button>
  </div>
)}
```

Import `ClipboardList` from `lucide-react`.

- [ ] **Step 3: In `WorkspaceShell`, fetch checklist presence + open-count on mount**

Add a `useEffect` that calls `GET /api/workspaces/${workspace.id}/checklist` and derives:

```typescript
const hasChecklist = !!data.checklist;
const openCount = data.items.filter((i) => i.status === 'not_started' || i.status === 'in_progress').length;
```

Store in local state. Pass to `FolderSidebar`.

For admin with no checklist, still show the pinned "Checklist" entry so admin can see the import CTA (the empty-state in the center panel provides the action). Gate this with `hasChecklist || isAdmin`.

- [ ] **Step 4: Switch center panel to the new `view` state**

In the center panel block (at [cis-deal-room/src/components/workspace/WorkspaceShell.tsx:221-242](cis-deal-room/src/components/workspace/WorkspaceShell.tsx#L221-L242)):

```tsx
{view.kind === 'overview' ? (
  <DealOverview /* existing props */ />
) : view.kind === 'checklist' ? (
  <ChecklistView
    workspaceId={workspace.id}
    isAdmin={isAdmin}
    onAssignedOwnersChanged={/* refresh counter */}
  />
) : (
  <FileList /* existing props */ folderId={view.folderId} />
)}
```

(`ChecklistView` is implemented in Task 22; leave a stub component for now.)

- [ ] **Step 5: Manual verify**

Restart dev server, open a workspace. Expected:
- Checklist entry appears in sidebar
- Clicking swaps center panel to a placeholder

### Task 22: Empty-state + import modal

**Files:**
- Create: `cis-deal-room/src/components/workspace/ChecklistView.tsx`
- Create: `cis-deal-room/src/components/workspace/ChecklistImportModal.tsx`

- [ ] **Step 1: Create `ChecklistView.tsx` with loading + empty states**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ChecklistImportModal } from './ChecklistImportModal';

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onAssignedOwnersChanged?: () => void;
}

export function ChecklistView({ workspaceId, isAdmin, onAssignedOwnersChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<ChecklistItemRow[]>([]);
  const [showImport, setShowImport] = useState(false);

  async function refresh() {
    setLoading(true);
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/checklist`);
    if (res.ok) {
      const data = await res.json();
      setChecklist(data.checklist);
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [workspaceId]);

  if (loading) return <div className="p-8 text-text-muted">Loading…</div>;

  if (!checklist) {
    if (isAdmin) {
      return (
        <div className="p-8 max-w-xl">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList size={32} className="text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Import diligence checklist</h2>
            <p className="text-sm text-text-secondary">
              Upload an .xlsx of requested diligence items to track progress and let
              participants upload against each request.
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-inverse
                text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Upload size={14} />
              Import checklist
            </button>
          </div>
          {showImport && (
            <ChecklistImportModal
              workspaceId={workspaceId}
              onClose={() => setShowImport(false)}
              onImported={() => { setShowImport(false); refresh(); }}
            />
          )}
        </div>
      );
    }
    return <div className="p-8 text-text-muted text-sm">No checklist yet.</div>;
  }

  // Full table — implemented in Task 23
  return <ChecklistTable items={items} isAdmin={isAdmin} onChanged={refresh} workspaceId={workspaceId} />;
}
```

Define the `ChecklistItemRow` type inline (mirror the shape returned by `listItemsForViewer`). Stub `<ChecklistTable>` as a placeholder `<div />` until Task 23.

- [ ] **Step 2: Create `ChecklistImportModal.tsx`**

The modal follows the two-phase UX: drop file → call `/preview` → show preview → confirm → call `/import`.

```tsx
'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ParsedRow } from '@/lib/checklist/parse-xlsx';

interface Props {
  workspaceId: string;
  onClose: () => void;
  onImported: () => void;
}

interface PreviewPayload {
  valid: ParsedRow[];
  rejected: Array<{ rowNumber: number; reason: string }>;
}

export function ChecklistImportModal({ workspaceId, onClose, onImported }: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onDrop = async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/preview`,
      { method: 'POST', body: form },
    );
    if (!res.ok) {
      toast.error('Failed to parse file');
      return;
    }
    setPreview(await res.json());
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  });

  async function handleConfirm() {
    if (!preview) return;
    setSubmitting(true);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.valid }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Import failed');
      return;
    }
    const data = await res.json();
    toast.success(`Imported ${data.itemCount} items`);
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Import checklist</h2>

        {!preview ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition
              ${isDragActive ? 'border-accent bg-accent-subtle/20' : 'border-border'}`}
          >
            <input {...getInputProps()} />
            <p className="text-sm text-text-secondary">
              Drop an .xlsx file here, or click to browse.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">{preview.valid.length}</strong> valid rows,{' '}
              <strong className={preview.rejected.length > 0 ? 'text-accent' : 'text-text-primary'}>
                {preview.rejected.length}
              </strong>{' '}
              rejected.
            </p>

            {preview.rejected.length > 0 && (
              <div className="border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  Rejected rows
                </p>
                <ul className="text-xs text-text-secondary space-y-1">
                  {preview.rejected.map((r) => (
                    <li key={r.rowNumber}>
                      Row {r.rowNumber}: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 cursor-pointer"
              >
                Start over
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || preview.valid.length === 0}
                className="bg-accent hover:bg-accent-hover text-text-inverse
                  text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Importing…' : `Import ${preview.valid.length} rows`}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 text-xs text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

Restart dev server. As admin, click the Checklist sidebar entry in an empty workspace. Expected:
- See "Import diligence checklist" empty state
- Click → modal opens with dropzone
- Drop the reference `.xlsx` (Rob's 46-row example from the spec image) → preview shows valid/rejected counts
- Confirm → toast "Imported N items"; sidebar-triggered refresh loads the table stub

If imports fail, check browser network tab for 4xx/5xx responses; common issue is the `requestedAt` parsing (nullable datetime — update the zod schema to accept `''` or `null`).

### Task 23: Commit Phase 7

```bash
git add cis-deal-room/src/components/workspace/ChecklistView.tsx \
        cis-deal-room/src/components/workspace/ChecklistImportModal.tsx \
        cis-deal-room/src/components/workspace/FolderSidebar.tsx \
        cis-deal-room/src/components/workspace/WorkspaceShell.tsx
git commit -m "feat(checklist-ui): sidebar entry, empty state, import modal"
```

---

## Phase 8 — UI: checklist table + inline controls

### Task 24: `ChecklistTable` — read view

**Files:**
- Create: `cis-deal-room/src/components/workspace/ChecklistTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import type { ChecklistPriority, ChecklistOwner, ChecklistStatus } from '@/types';
import { ChecklistStatusChip } from './ChecklistStatusChip';
import { ChecklistRowActions } from './ChecklistRowActions';

export interface ChecklistItemRow {
  id: string;
  sortOrder: number;
  category: string;
  folderId: string;
  name: string;
  description: string | null;
  priority: ChecklistPriority;
  owner: ChecklistOwner;
  status: ChecklistStatus;
  notes: string | null;
  requestedAt: string;
  receivedAt: string | null;
}

interface Props {
  workspaceId: string;
  items: ChecklistItemRow[];
  isAdmin: boolean;
  onChanged: () => void;
  onUploadForItem: (item: ChecklistItemRow) => void;
}

const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const OWNER_LABEL: Record<ChecklistOwner, string> = {
  seller: 'Seller', buyer: 'Buyer', both: 'Both', cis_team: 'CIS Team', unassigned: 'Unassigned',
};

export function ChecklistTable({ workspaceId, items, isAdmin, onChanged, onUploadForItem }: Props) {
  if (items.length === 0) {
    return <p className="p-8 text-sm text-text-muted">No checklist items visible.</p>;
  }

  return (
    <div className="p-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs uppercase text-text-muted tracking-wider border-b border-border">
            <th className="text-left font-medium py-2 px-2 w-10">#</th>
            <th className="text-left font-medium py-2 px-2">Category</th>
            <th className="text-left font-medium py-2 px-2">Item</th>
            <th className="text-left font-medium py-2 px-2">Priority</th>
            <th className="text-left font-medium py-2 px-2">Owner</th>
            <th className="text-left font-medium py-2 px-2">Status</th>
            {isAdmin && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-border-subtle hover:bg-surface">
              <td className="py-2 px-2 font-mono text-xs text-text-muted">{it.sortOrder}</td>
              <td className="py-2 px-2 text-text-secondary">{it.category}</td>
              <td className="py-2 px-2">
                <button
                  onClick={() => onUploadForItem(it)}
                  className="text-left text-text-primary hover:text-accent hover:underline"
                >
                  {it.name}
                </button>
              </td>
              <td className="py-2 px-2 text-text-secondary">{PRIORITY_LABEL[it.priority]}</td>
              <td className="py-2 px-2 text-text-secondary">{OWNER_LABEL[it.owner]}</td>
              <td className="py-2 px-2">
                <ChecklistStatusChip
                  workspaceId={workspaceId}
                  itemId={it.id}
                  status={it.status}
                  isAdmin={isAdmin}
                  onChanged={onChanged}
                />
              </td>
              {isAdmin && (
                <td className="py-2 px-2">
                  <ChecklistRowActions
                    workspaceId={workspaceId}
                    item={it}
                    onChanged={onChanged}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire the `onUploadForItem` handler in `ChecklistView`**

`ChecklistView` needs to open the existing `UploadModal` with the item's folder + item pre-filled. Since `UploadModal` is owned by `WorkspaceShell`, lift the "open upload for item" call upward via a prop: `onUploadForItem: (folderId, itemId, itemName) => void`.

In `WorkspaceShell`, add a handler that sets upload-modal state with:
```typescript
setShowUploadModal(true);
setUploadFolderHint(folderId);
setUploadItemHint(itemId);
```

(Extended props implemented in Task 26.)

### Task 25: Status chip + row actions

**Files:**
- Create: `cis-deal-room/src/components/workspace/ChecklistStatusChip.tsx`
- Create: `cis-deal-room/src/components/workspace/ChecklistRowActions.tsx`

- [ ] **Step 1: `ChecklistStatusChip`**

```tsx
'use client';

import { useState } from 'react';
import { Check, XCircle, MinusCircle, RotateCcw, CircleDashed, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { ChecklistStatus } from '@/types';

const CHIP: Record<ChecklistStatus, { label: string; icon: React.ReactNode; className: string }> = {
  not_started:  { label: 'Not Started', icon: <CircleDashed size={12} />, className: 'bg-surface-elevated text-text-muted' },
  in_progress:  { label: 'In Progress', icon: <Clock size={12} />, className: 'bg-accent-subtle text-accent-on-subtle' },
  received:     { label: 'Received',    icon: <Check size={12} />, className: 'bg-emerald-950 text-emerald-300 border border-emerald-800' },
  waived:       { label: 'Waived',      icon: <XCircle size={12} />, className: 'bg-amber-950 text-amber-300 border border-amber-800' },
  n_a:          { label: 'N/A',         icon: <MinusCircle size={12} />, className: 'bg-surface-elevated text-text-muted' },
};

interface Props {
  workspaceId: string;
  itemId: string;
  status: ChecklistStatus;
  isAdmin: boolean;
  onChanged: () => void;
}

export function ChecklistStatusChip({ workspaceId, itemId, status, isAdmin, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const chip = CHIP[status];

  async function setStatus(target: ChecklistStatus | 'reset') {
    setOpen(false);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/items/${itemId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      },
    );
    if (!res.ok) {
      toast.error('Failed to update status');
      return;
    }
    onChanged();
  }

  const chipNode = (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${chip.className}`}>
      {chip.icon}
      {chip.label}
    </span>
  );

  if (!isAdmin) return chipNode;

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent rounded">
        {chipNode}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[140px]">
            {(['received', 'waived', 'n_a'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setStatus(t)}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated cursor-pointer flex items-center gap-2"
              >
                {CHIP[t].icon}
                Mark {CHIP[t].label}
              </button>
            ))}
            <div className="border-t border-border-subtle">
              <button
                onClick={() => setStatus('reset')}
                className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated cursor-pointer flex items-center gap-2"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ChecklistRowActions`**

An overflow-menu (three-dot) component with: Edit, Change owner, Delete. Opens an edit modal (reuse a simple modal pattern). Owner change calls the existing PATCH item endpoint.

For MVP, the simplest pass: on "Edit", open `ChecklistItemEditModal` (below) that shows fields for name / description / priority / owner / folder / notes and PATCHes on save. "Delete" confirms via the existing `ConfirmDialog` pattern (per memory: `ui/ConfirmDialog.tsx` + `lib/use-soft-delete.ts`).

```tsx
'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChecklistItemEditModal } from './ChecklistItemEditModal';
import type { ChecklistItemRow } from './ChecklistTable';

interface Props {
  workspaceId: string;
  item: ChecklistItemRow;
  onChanged: () => void;
}

export function ChecklistRowActions({ workspaceId, item, onChanged }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setConfirmDelete(false);
    const res = await fetchWithAuth(
      `/api/workspaces/${workspaceId}/checklist/items/${item.id}`,
      { method: 'DELETE' },
    );
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Item deleted');
    onChanged();
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1 text-text-muted hover:text-text-primary rounded cursor-pointer"
          aria-label="Row actions"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-md overflow-hidden min-w-[120px]">
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                className="w-full text-left px-3 py-2 text-xs text-accent hover:bg-accent-subtle/20 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <ChecklistItemEditModal
          workspaceId={workspaceId}
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete checklist item"
          message={`Delete "${item.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: `ChecklistItemEditModal`**

Accepts `workspaceId`, `item`, `onClose`, `onSaved`. Renders a form with inputs for name, description, priority (select), owner (select), folder (select — populated via the sidebar folders), notes. Submit PATCHes to `/items/[itemId]`.

Reuse the modal shell styling from `ChecklistImportModal`.

### Task 26: Hook item-click → upload modal with item pre-fill

**Files:**
- Modify: `cis-deal-room/src/components/workspace/UploadModal.tsx`
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Extend `UploadModal` props to accept optional checklist item**

Add props: `initialChecklistItemId?: string | null`, `checklistItems?: Array<{ id: string; name: string; folderId: string }>`.

- [ ] **Step 2: Add the "Link to checklist item" field inside the modal**

Below the folder selector, conditionally on `checklistItems && checklistItems.length > 0`:

```tsx
<div className="mt-3">
  <label className="block text-xs font-medium text-text-secondary mb-1">
    Link to checklist item (optional)
  </label>
  <select
    value={selectedItemId ?? ''}
    onChange={(e) => setSelectedItemId(e.target.value || null)}
    className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-sm text-text-primary"
  >
    <option value="">— None —</option>
    {checklistItems
      .filter((it) => !selectedFolderId || it.folderId === selectedFolderId)
      .map((it) => (
        <option key={it.id} value={it.id}>{it.name}</option>
      ))}
  </select>
</div>
```

Add `selectedItemId` state, initialized from `initialChecklistItemId`.

- [ ] **Step 3: After upload succeeds, link the file to the item**

In the `onUploadComplete` handler, if `selectedItemId` is set, call:

```typescript
await fetchWithAuth(
  `/api/workspaces/${workspaceId}/checklist/items/${selectedItemId}/links`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: uploadedFile.id }),
  },
);
```

- [ ] **Step 4: In `WorkspaceShell`, pass `checklistItems` + handle the item-click from `ChecklistView`**

Fetch `/checklist` (already planned in Task 21 Step 3). Pass the items (mapped to `{ id, name, folderId }`) to `UploadModal`. When `ChecklistView` fires `onUploadForItem(item)`, set `uploadFolderHint = item.folderId` and `uploadItemHint = item.id` and open the modal.

- [ ] **Step 5: Manual verify end-to-end**

1. As admin, import the .xlsx (reuse Task 22 preview).
2. Click an item name → upload modal opens with folder pre-selected and item pre-filled in the new dropdown.
3. Upload → status chip for that item moves to `In Progress` after refresh.
4. Click status chip → Mark Received → chip shows Received.
5. Delete the uploaded file from the folder view (existing UI). Status stays Received.
6. Reset the item's status via chip → reverts to `Not Started` (since link is gone).

### Task 27: Commit Phase 8

```bash
git add cis-deal-room/src/components/workspace/
git commit -m "feat(checklist-ui): table, status chip, row actions, upload linking"
```

---

## Phase 9 — Notification: `checklist_item_assigned`

### Task 28: Email template + enqueue wiring

**Files:**
- Create: `cis-deal-room/src/lib/email/checklist-assigned.tsx` (React Email template)
- Create: `cis-deal-room/src/lib/notifications/enqueue-checklist-assigned.ts`
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/items/[itemId]/route.ts` (the PATCH handler, to call the enqueue function on owner assignment)

- [ ] **Step 1: Build the email template**

Mirror existing React Email templates (e.g., `cis-deal-room/src/lib/email/daily-digest.tsx`). Minimal fields: workspace name, item count (1 for single-assignment, N for batched), deep link to `/workspace/<id>` with a `view=checklist` hint or just linking to the checklist.

- [ ] **Step 2: Build the enqueue helper**

```typescript
// cis-deal-room/src/lib/notifications/enqueue-checklist-assigned.ts
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, users, workspaces } from '@/db/schema';
import { enqueueOrSend } from './enqueue-or-send';
import type { ChecklistOwner, ParticipantRole, CisAdvisorySide, ViewOnlyShadowSide } from '@/types';
import { ownerFilterForSession } from '@/lib/dal/checklist';
import { ChecklistAssignedEmail } from '@/lib/email/checklist-assigned';

/**
 * Called when an item's owner transitions from 'unassigned' → a concrete side.
 * Resolves which workspace participants see the new owner (per role filter)
 * and enqueues one notification per participant.
 */
export async function enqueueChecklistAssignedNotifications(input: {
  workspaceId: string;
  itemId: string;
  itemName: string;
  newOwner: Exclude<ChecklistOwner, 'unassigned'>;
}): Promise<void> {
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!workspace) return;

  const participants = await db
    .select({
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
      shadow: workspaceParticipants.viewOnlyShadowSide,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(
      and(
        eq(workspaceParticipants.workspaceId, input.workspaceId),
        eq(workspaceParticipants.status, 'active'),
      ),
    );

  const recipients = participants.filter((p) => {
    const filter = ownerFilterForSession({
      isAdmin: false,
      role: p.role,
      shadowSide: p.shadow,
      cisAdvisorySide: workspace.cisAdvisorySide,
    });
    return filter !== null && filter.includes(input.newOwner);
  });

  await Promise.all(
    recipients.map((r) =>
      enqueueOrSend({
        userId: r.userId,
        workspaceId: input.workspaceId,
        action: 'checklist_item_assigned',
        targetType: 'file',
        targetId: input.itemId,
        metadata: { itemName: input.itemName, owner: input.newOwner },
        channel: 'uploads',
        immediateEmail: async () => ({
          to: r.email,
          subject: `New diligence item assigned: ${input.itemName}`,
          react: ChecklistAssignedEmail({
            workspaceName: workspace.name,
            itemName: input.itemName,
            workspaceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/workspace/${workspace.id}`,
          }),
        }),
      }),
    ),
  );
}
```

Note: batching (one email per admin session instead of per item) is deferred — for MVP, each assignment fires an email. If noise becomes an issue, Phase 2 follow-up can aggregate in `notification_queue` with a short delay.

- [ ] **Step 3: Wire into the PATCH item route**

In the PATCH `/items/[itemId]` handler (Task 19 Step 3), after calling `updateItem`:

```typescript
if (result.newlyAssignedOwner && result.newlyAssignedOwner !== 'unassigned') {
  await enqueueChecklistAssignedNotifications({
    workspaceId,
    itemId,
    itemName: result.updated.name,
    newOwner: result.newlyAssignedOwner as Exclude<ChecklistOwner, 'unassigned'>,
  });
}
```

- [ ] **Step 4: Also wire into the import endpoint**

In Task 17's import route, after inserting items, collect any rows with non-`unassigned` owner and call `enqueueChecklistAssignedNotifications` for each. (This covers the case where the spreadsheet already has Owner filled in.)

- [ ] **Step 5: Manual verify**

Invite a seller-side participant. Import a checklist with some rows already owned by "Seller" OR assign a row's owner from unassigned → seller after import. Expected: the seller receives the email (or an entry lands in `notification_queue` if they have `notifyDigest = true`).

### Task 29: Commit Phase 9

```bash
git add cis-deal-room/src/lib/email/ \
        cis-deal-room/src/lib/notifications/ \
        cis-deal-room/src/app/api/workspaces/\[id\]/checklist
git commit -m "feat(checklist): enqueue checklist_item_assigned notifications"
```

---

## Phase 10 — Activity feed verbs

### Task 30: Teach `ActivityRow` to render checklist events

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ActivityRow.tsx`

- [ ] **Step 1: Add verb mappings**

At [cis-deal-room/src/components/workspace/ActivityRow.tsx:21-34](cis-deal-room/src/components/workspace/ActivityRow.tsx#L21-L34), extend the `ACTION_VERBS` dict:

```typescript
checklist_imported: 'imported a diligence checklist',
checklist_item_linked: 'linked a file to',
checklist_item_received: 'marked as received',
checklist_item_waived: 'marked as waived',
checklist_item_na: 'marked as N/A',
checklist_item_assigned: 'assigned',
```

- [ ] **Step 2: Extend `resolveTarget` to handle `metadata.itemName` and the new verbs**

At [cis-deal-room/src/components/workspace/ActivityRow.tsx:43-62](cis-deal-room/src/components/workspace/ActivityRow.tsx#L43-L62), add an early return in `resolveTarget`:

```typescript
if (typeof metadata?.itemName === 'string') return metadata.itemName;
```

- [ ] **Step 3: Manual verify**

Check the right-panel activity feed for a workspace with recent checklist activity. Expected: human-readable rows like "Rob imported a diligence checklist" and "Rob marked as received Cap Table".

### Task 31: Commit Phase 10

```bash
git add cis-deal-room/src/components/workspace/ActivityRow.tsx
git commit -m "feat(activity): render checklist action verbs"
```

---

## Phase 11 — Final review + PR

### Task 32: End-to-end smoke

- [ ] **Step 1: Run the full test + typecheck suite**

```bash
cd cis-deal-room && npm run typecheck && npm test
```

Expected: both pass clean. Fix any regressions.

- [ ] **Step 2: Cold-start manual smoke on `npm run dev`**

Checklist:
- Create a fresh workspace as admin
- Invite one seller_rep, one buyer_rep, one view_only (with shadow side), one seller_counsel
- Import an `.xlsx` with mixed Owner values
- As each invitee, log in and verify row visibility matches the Permissions table (§3 of the spec)
- Click-to-upload as seller_rep, verify status transitions
- Mark one item Received, one Waived, one N/A
- Delete the file backing an In Progress item → status reverts to Not Started
- Try to delete a folder that has checklist items referencing it → error toast

- [ ] **Step 3: Push branch + open PR**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git push -u origin feat/diligence-checklist

gh pr create --title "feat: diligence checklist (import + linking)" --body "$(cat <<'EOF'
## Summary
- Per-workspace diligence checklist imported from .xlsx with auto folder mapping
- Click-to-upload per item with auto-linking; optional link field on all uploads
- Filtered row visibility per participant role + new counsel roles + view_only shadow side
- Status state machine with admin terminal states (Received / Waived / N/A)
- `checklist_item_assigned` notification; activity feed verbs

Design spec: docs/superpowers/specs/2026-04-21-diligence-checklist-design.md
Implementation plan: docs/superpowers/plans/2026-04-21-diligence-checklist.md

## Test plan
- [ ] Preview URL loads without console errors
- [ ] Admin can import the reference .xlsx, see preview, and confirm
- [ ] Folders auto-create for new categories
- [ ] Seller participant sees only seller/both rows
- [ ] view_only user cannot click-to-upload
- [ ] Item click opens upload modal with folder + item pre-filled
- [ ] Upload transitions status not_started → in_progress
- [ ] Mark Received persists across deleting the underlying file
- [ ] Folder with checklist items cannot be deleted
- [ ] `checklist_item_assigned` email delivered when owner set from unassigned

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for Rob to review the preview URL**

Do not merge. Rob merges via `gh pr merge <N> --squash --delete-branch` after previewing.

---

## Self-review checklist (for the implementer)

After completing each phase, verify:

- [ ] `npm run typecheck` is clean
- [ ] `npm test` is clean
- [ ] No `counsel` values in new code paths (use `seller_counsel` / `buyer_counsel`)
- [ ] Every destructive action goes through `ConfirmDialog` (per project pattern, memory: `ui/ConfirmDialog.tsx`)
- [ ] No `window.confirm` anywhere in new code
- [ ] New API routes all call `requireDealAccess` before touching DB
- [ ] Admin-only routes check `session.isAdmin`
- [ ] All DB writes that affect shared state log activity in the same transaction
- [ ] `view_only` users have no upload affordance in any new UI

## Spec coverage matrix

Every requirement in the spec should be reachable from a task above. If you spot a gap during implementation, add a sub-step rather than quietly skipping it.

| Spec section | Task(s) |
|---|---|
| §Problem / Goal | Entire plan |
| §User flows / Admin imports | 16, 17, 22 |
| §User flows / Admin edits post-import | 19, 25 |
| §User flows / Participant responds | 21, 24, 26 |
| §User flows / Admin closes items | 13, 25 |
| §User flows / Normal folder-flow uploads | 26 |
| §Data model — new tables | 2, 3 |
| §Data model — enum additions | 1, 3, 4 |
| §Data model — workspace_participants shadow side | 2, 4, 7, 8 |
| §Status state machine | 13, 25 |
| §Permissions / filtering | 4, 10, 11 |
| §Import format (xlsx only) | 16, 17 |
| §Cascade semantics — link cascade | 13 |
| §Cascade semantics — folder block | 15 |
| §Notifications (assigned) | 28 |
| §UI placement — sidebar + table | 21, 22, 24 |
| §Success criteria | 32 |
