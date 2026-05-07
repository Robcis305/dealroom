# Buy-side Custom Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On buy-side advisory workspaces, skip the canonical 48-item playbook entirely and let admins upload their own request list (CSV or XLSX). Sell-side workspaces are unchanged.

**Architecture:** Add a pure helper `shouldShowCanonicalPlaybook(workspace)` that returns false for buy-side. Two API endpoints (`GET /checklist`, `GET /readiness`) branch on this. `ensureChecklistForWorkspace` no-ops on buy-side. The existing PR #8 import flow is extended to accept CSV in addition to XLSX (the `xlsx` library handles both natively). Re-import on buy-side replaces existing items; sell-side keeps the v1.3 invariant of returning 409. ReadinessPanel gains a simple `mode: 'simple'` variant for buy-side. One-time data migration cleans up canonical-overlay rows on existing buy-side workspaces.

**Tech Stack:** Next.js 16 App Router + TypeScript + Drizzle + Postgres (Neon) + Vitest/RTL + `xlsx` library.

**Spec:** `docs/superpowers/specs/2026-05-07-buy-side-checklist-design.md`.

**Codebase notes:**
- Branch is `feat/buy-side-checklist` — do NOT switch
- App lives in `cis-deal-room/`; tests via `npx vitest run`; tsc via `npx tsc --noEmit`
- Migrations follow the established `apply-NNNN-direct.mjs` pattern; idempotent direct-apply scripts. User applies to shared preview/prod DB after review
- The PR #8 import flow has TWO endpoints: `POST /checklist/preview` (parse only, no commit) and `POST /checklist/import` (commit). Both need CSV support
- The existing parser is at `cis-deal-room/src/lib/checklist/parse-xlsx.ts` (179 lines). Renamed to `parse-checklist-file.ts` for accuracy
- The `xlsx` library handles CSV via `XLSX.read(text, { type: 'string' })` — no new dependency
- UI work (the new `mode: 'simple'` ReadinessPanel render) MUST use `ui-ux-pro-max` skill

---

## File structure

```
cis-deal-room/
├── scripts/
│   └── apply-0015-direct.mjs                              [Task 1 — new]
├── src/
│   ├── db/migrations/
│   │   └── 0015_buy_side_cleanup.sql                      [Task 1 — new]
│   ├── lib/
│   │   ├── checklist/
│   │   │   └── parse-xlsx.ts → parse-checklist-file.ts    [Task 3 — rename + extend]
│   │   └── dal/
│   │       ├── playbook.ts                                [Task 2 — add shouldShowCanonicalPlaybook]
│   │       └── checklist.ts                               [Task 2 — skip auto-create on buy-side]
│   ├── app/api/workspaces/[id]/
│   │   ├── checklist/
│   │   │   ├── route.ts                                   [Task 2 — branch response by advisory side]
│   │   │   ├── preview/route.ts                           [Task 3 — accept CSV]
│   │   │   └── import/route.ts                            [Task 5 — replace-on-reupload for buy-side]
│   │   └── readiness/route.ts                             [Task 6 — simple mode for buy-side]
│   └── components/workspace/
│       ├── ChecklistImportModal.tsx                       [Task 4 — accept CSV in dropzone]
│       └── ReadinessPanel.tsx                             [Task 6 — simple mode render]
└── src/test/                                              [Tests added per task]
```

---

## Task 1: Data migration to clean up canonical-overlay rows on existing buy-side workspaces

**Files:**
- Create: `cis-deal-room/src/db/migrations/0015_buy_side_cleanup.sql`
- Create: `cis-deal-room/scripts/apply-0015-direct.mjs`

### Step 1: Write the migration SQL

Create `cis-deal-room/src/db/migrations/0015_buy_side_cleanup.sql`:

```sql
-- One-time cleanup: remove canonical-overlay checklist_items rows on workspaces
-- with cisAdvisorySide = 'buyer_side'. Custom items (playbook_item_id IS NULL)
-- are preserved. Buy-side workspaces will use the new import-only flow from
-- v1.6 onward.
--
-- Idempotent: re-running on already-cleaned workspaces is a no-op since the
-- rows aren't there.

DELETE FROM checklist_items
WHERE playbook_item_id IS NOT NULL
  AND checklist_id IN (
    SELECT c.id FROM checklists c
    JOIN workspaces w ON w.id = c.workspace_id
    WHERE w.cis_advisory_side = 'buyer_side'
  );
```

### Step 2: Write the apply script

Create `cis-deal-room/scripts/apply-0015-direct.mjs` modeled on `apply-0014-direct.mjs`:

```js
// scripts/apply-0015-direct.mjs
//
// Buy-side cleanup: removes canonical-overlay checklist_items rows on
// workspaces where cisAdvisorySide = 'buyer_side'. Custom items
// (playbook_item_id IS NULL) are preserved. Idempotent.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

console.log('=== 1. count rows to delete ===');
const [{ count: before }] = await sql`
  SELECT count(*)::int AS count FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
`;
console.log(`canonical-overlay rows on buy-side workspaces: ${before}`);

console.log('\n=== 2. DELETE canonical-overlay rows on buy-side workspaces ===');
const deleted = await sql`
  DELETE FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
  RETURNING id
`;
console.log(`deleted ${deleted.length} rows`);

console.log('\n=== 3. verify ===');
const [{ count: after }] = await sql`
  SELECT count(*)::int AS count FROM checklist_items
  WHERE playbook_item_id IS NOT NULL
    AND checklist_id IN (
      SELECT c.id FROM checklists c
      JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.cis_advisory_side = 'buyer_side'
    )
`;
console.log(`remaining canonical-overlay rows on buy-side workspaces: ${after}`);

if (after !== 0) {
  console.error('ERROR: cleanup did not complete; some rows remain');
  process.exit(1);
}
console.log('\nAll checks passed.');
```

### Step 3: Apply locally

```bash
cd cis-deal-room && node --env-file=.env.local scripts/apply-0015-direct.mjs
```

Expected: prints the count before, the deletion summary, and 0 remaining. Note the count number for verification.

### Step 4: Verify custom items on buy-side workspaces are preserved

```bash
cd cis-deal-room && node --env-file=.env.local -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql\`
  SELECT w.name AS workspace_name, count(ci.id)::int AS custom_item_count
  FROM workspaces w
  JOIN checklists c ON c.workspace_id = w.id
  JOIN checklist_items ci ON ci.checklist_id = c.id
  WHERE w.cis_advisory_side = 'buyer_side' AND ci.playbook_item_id IS NULL
  GROUP BY w.name
\`;
console.log('buy-side workspaces with custom items preserved:', rows);
" --input-type=module
```

Expected: prints the buy-side workspaces that have custom items remaining (should match what existed before the migration — e.g., Project Chronos's 79 imported items).

### Step 5: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/db/migrations/0015_buy_side_cleanup.sql \
        cis-deal-room/scripts/apply-0015-direct.mjs
git commit -m "feat(buy-side-checklist): migration 0015 — cleanup canonical-overlay rows on buy-side workspaces"
```

---

## Task 2: `shouldShowCanonicalPlaybook` helper + skip auto-create on buy-side + branch GET response

**Files:**
- Modify: `cis-deal-room/src/lib/dal/playbook.ts` — add `shouldShowCanonicalPlaybook`
- Modify: `cis-deal-room/src/lib/dal/checklist.ts` — `ensureChecklistForWorkspace` no-ops on buy-side
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts` — branch on advisory side
- Modify: `cis-deal-room/src/test/dal/playbook.test.ts` — add tests for new helper

### Step 1: Write failing tests

Append to `cis-deal-room/src/test/dal/playbook.test.ts`:

```ts
describe('shouldShowCanonicalPlaybook', () => {
  it('returns true for sell-side workspaces', async () => {
    const { shouldShowCanonicalPlaybook } = await import('@/lib/dal/playbook');
    expect(shouldShowCanonicalPlaybook({ cisAdvisorySide: 'seller_side' })).toBe(true);
  });

  it('returns false for buy-side workspaces', async () => {
    const { shouldShowCanonicalPlaybook } = await import('@/lib/dal/playbook');
    expect(shouldShowCanonicalPlaybook({ cisAdvisorySide: 'buyer_side' })).toBe(false);
  });
});
```

### Step 2: Run, confirm fail

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 2 new tests fail with "shouldShowCanonicalPlaybook is not a function".

### Step 3: Add the helper

In `cis-deal-room/src/lib/dal/playbook.ts`, near the top exports (next to other helpers like `applyCapTableVisibilityGate` if present, or just add a new export):

```ts
import type { CisAdvisorySide } from '@/types';

/**
 * Whether a workspace should display the canonical 48-item Data Room
 * Construction Playbook overlay. On sell-side advisory engagements the
 * playbook is the diligence prep checklist. On buy-side, the playbook is
 * not used — the buyer-side advisor uploads their own request list per
 * engagement (see v1.6 spec).
 */
export function shouldShowCanonicalPlaybook(
  workspace: { cisAdvisorySide: CisAdvisorySide },
): boolean {
  return workspace.cisAdvisorySide === 'seller_side';
}
```

### Step 4: Run tests, verify pass

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 2 new tests pass.

### Step 5: Skip auto-create on buy-side in `ensureChecklistForWorkspace`

Read the current `cis-deal-room/src/lib/dal/checklist.ts` to find `ensureChecklistForWorkspace`. Modify the function to look up the workspace's `cisAdvisorySide` and short-circuit if `shouldShowCanonicalPlaybook` returns false.

```ts
import { shouldShowCanonicalPlaybook } from './playbook';
import { workspaces } from '@/db/schema';

export async function ensureChecklistForWorkspace(
  workspaceId: string,
  createdBy: string,
) {
  // Look up the workspace to decide whether the canonical playbook overlay
  // should be auto-anchored. On buy-side workspaces, we DO NOT auto-create
  // the checklist row — the import flow becomes the explicit way to populate
  // a checklist for that workspace.
  const [ws] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) return null;

  if (!shouldShowCanonicalPlaybook(ws)) {
    // Buy-side: defer creation to the explicit import flow.
    return await getChecklistForWorkspace(workspaceId);
  }

  const existing = await getChecklistForWorkspace(workspaceId);
  if (existing) return existing;

  const [created] = await db
    .insert(checklists)
    .values({ workspaceId, createdBy })
    .returning();

  return created;
}
```

(Adapt to the existing function shape. The key change is: if `shouldShowCanonicalPlaybook(ws) === false`, return whatever exists without creating.)

### Step 6: Branch the GET `/checklist` response

In `cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts`, modify the GET handler to:

1. Resolve `workspace.cisAdvisorySide` (already needed elsewhere for visibility gating)
2. If `shouldShowCanonicalPlaybook(workspace) === false`, return `{ checklist, items }` shape (the existing buyer-side legacy path) instead of `{ checklist, playbook }`
3. Sell-side path is unchanged

Pseudo-diff inside the GET handler:

```ts
import { shouldShowCanonicalPlaybook } from '@/lib/dal/playbook';

// … existing auth + workspace lookup …

const showPlaybook = shouldShowCanonicalPlaybook(workspace) && (
  session.isAdmin || /* existing role-based showPlaybook conditions */
);

// On buy-side workspaces, also do NOT auto-create the checklist row.
let checklist = await getChecklistForWorkspace(workspaceId);
if (!checklist && shouldShowCanonicalPlaybook(workspace)) {
  // Sell-side eligible viewer — auto-create per v1.3 behavior.
  if (showPlaybook) {
    checklist = await ensureChecklistForWorkspace(workspaceId, session.userId);
  }
}

// … rest of handler. When showPlaybook is true, return { checklist, playbook };
// otherwise return { checklist, items } with listItemsForViewer …
```

(The exact integration depends on the existing handler's flow. Read the file before editing. The outcome must be: buy-side response is `{ checklist, items }`, sell-side response unchanged.)

### Step 7: Run tests + tsc

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean. No regressions.

### Step 8: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/lib/dal/playbook.ts \
        cis-deal-room/src/lib/dal/checklist.ts \
        cis-deal-room/src/app/api/workspaces/[id]/checklist/route.ts \
        cis-deal-room/src/test/dal/playbook.test.ts
git commit -m "feat(buy-side-checklist): shouldShowCanonicalPlaybook helper + skip canonical overlay on buy-side"
```

---

## Task 3: Extend the parser to accept CSV in addition to XLSX

**Files:**
- Rename + modify: `cis-deal-room/src/lib/checklist/parse-xlsx.ts` → `cis-deal-room/src/lib/checklist/parse-checklist-file.ts`
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts` (callers of the parser)
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts` (if it imports the parser; the import endpoint takes pre-parsed rows so likely doesn't)

### Step 1: Rename the file + extend logic

```bash
cd cis-deal-room
git mv src/lib/checklist/parse-xlsx.ts src/lib/checklist/parse-checklist-file.ts
```

Open the renamed file. The current file uses `XLSX.read(buffer, { type: 'array' })` (or similar) for XLSX binary input. Modify the entry-point function to detect file type from a `mimeType` or `filename` argument and route accordingly.

The signature should change from something like:

```ts
export function parseXlsx(buffer: ArrayBuffer): ParseResult { ... }
```

to:

```ts
export function parseChecklistFile(input: {
  buffer: ArrayBuffer;
  filename: string;
}): ParseResult {
  const isCsv = input.filename.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(new TextDecoder().decode(input.buffer), { type: 'string' })
    : XLSX.read(input.buffer, { type: 'array' });
  // … rest of existing parsing logic — sheet selection, header scan, row coercion …
  return result;
}
```

Keep all existing parse logic intact (header scan, row coercion, owner/priority normalization, header aliases). Only the FILE-TO-WORKBOOK step changes.

### Step 2: Update the preview endpoint

In `cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts`, the import path is currently `from '@/lib/checklist/parse-xlsx'`. Update:

```ts
// Old
import { parseXlsx } from '@/lib/checklist/parse-xlsx';

// New
import { parseChecklistFile } from '@/lib/checklist/parse-checklist-file';
```

Then update the call site. Pass both `buffer` and `filename` (the existing endpoint extracts `file` from formData; just pass `file.name` along with the buffer):

```ts
const buffer = await file.arrayBuffer();
const parsed = parseChecklistFile({ buffer, filename: file.name });
```

(Adapt to the existing handler shape — read the file before editing.)

### Step 3: Update the import endpoint if it uses the parser

Inspect `cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts`. The import endpoint takes pre-parsed rows in its JSON body (per the existing schema), so it doesn't directly call the parser. If it does, update the import the same way. Otherwise no change.

### Step 4: Update existing tests

If there's an existing test file `cis-deal-room/src/test/lib/checklist/parse-xlsx.test.ts` (or similar), rename it:

```bash
cd cis-deal-room
git mv src/test/lib/checklist/parse-xlsx.test.ts src/test/lib/checklist/parse-checklist-file.test.ts
```

Update the imports in the test file to reference `parse-checklist-file` and `parseChecklistFile`. The XLSX fixtures should still work (they're binary; the function detects `.xlsx` from filename).

### Step 5: Add CSV tests

Append CSV test cases to the renamed test file:

```ts
import { parseChecklistFile } from '@/lib/checklist/parse-checklist-file';

describe('parseChecklistFile — CSV input', () => {
  it('parses a minimal CSV with the same shape as XLSX', () => {
    const csv = `#,Category,Item,Description,Priority,Owner,Notes
1,Financial,Audited Financials,Last 3 years,critical,seller,
2,Legal,Cap Table,Reconciled with Carta,critical,seller,Use Carta export`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseChecklistFile({ buffer, filename: 'request-list.csv' });
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toMatchObject({
      sortOrder: 1,
      category: 'Financial',
      name: 'Audited Financials',
      priority: 'critical',
      owner: 'seller',
    });
  });

  it('detects format from filename extension (case-insensitive)', () => {
    const csv = `#,Category,Item,Priority,Owner
1,X,Y,medium,buyer`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result1 = parseChecklistFile({ buffer, filename: 'list.CSV' });
    expect(result1.valid).toHaveLength(1);

    const result2 = parseChecklistFile({ buffer, filename: 'list.csv' });
    expect(result2.valid).toHaveLength(1);
  });

  it('rejects rows with missing required fields in CSV', () => {
    const csv = `#,Category,Item,Priority,Owner
1,Financial,,medium,seller
2,,Audited,critical,seller`;
    const buffer = new TextEncoder().encode(csv).buffer;

    const result = parseChecklistFile({ buffer, filename: 'list.csv' });
    expect(result.rejected.length).toBeGreaterThan(0);
  });
});
```

(Adapt the test cases to match the existing parser's actual behavior re: required fields, header aliases, etc. Read the renamed parser file first to know what shape `valid` and `rejected` take.)

### Step 6: Run tests + tsc

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: existing XLSX tests pass + new CSV tests pass.

### Step 7: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/lib/checklist/ \
        cis-deal-room/src/app/api/workspaces/[id]/checklist/preview/route.ts \
        cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts \
        cis-deal-room/src/test/lib/checklist/
git commit -m "feat(buy-side-checklist): rename parse-xlsx → parse-checklist-file; accept CSV in addition to XLSX"
```

---

## Task 4: ChecklistImportModal accepts CSV

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ChecklistImportModal.tsx`

### Step 1: Update the dropzone `accept` config

In `cis-deal-room/src/components/workspace/ChecklistImportModal.tsx`, find the `useDropzone` call (around line 76-79):

```ts
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop,
  accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
  maxFiles: 1,
});
```

Replace with:

```ts
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop,
  accept: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/csv': ['.csv'],
  },
  maxFiles: 1,
});
```

### Step 2: Update the dropzone label / help text

Find the user-facing copy that says something like "Drop an .xlsx file here" and update it to reference both formats:

```tsx
// Before:
<p>Drop an .xlsx file here, or click to choose</p>

// After:
<p>Drop a .csv or .xlsx file here, or click to choose</p>
```

(Adapt the copy to match the existing tone in the modal.)

### Step 3: Verify TypeScript + tests

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean.

### Step 4: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/components/workspace/ChecklistImportModal.tsx
git commit -m "feat(buy-side-checklist): ChecklistImportModal accepts CSV in addition to XLSX"
```

---

## Task 5: Replace-on-reupload for buy-side workspaces in `/checklist/import`

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts`

### Step 1: Read the current import handler

```bash
cat cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts
```

The current handler returns 409 if a checklist already exists. We need to add a buy-side branch that deletes existing items and proceeds with the insert, rather than returning 409.

### Step 2: Modify the existing-checklist branch

Find the block that returns 409. Replace with:

```ts
import { eq } from 'drizzle-orm';
import { workspaces, checklistItems } from '@/db/schema';
import { shouldShowCanonicalPlaybook } from '@/lib/dal/playbook';

// … inside the POST handler, after parsing the body but before any inserts:

const [workspace] = await db
  .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
  .from(workspaces)
  .where(eq(workspaces.id, workspaceId))
  .limit(1);
if (!workspace) {
  return Response.json({ error: 'Workspace not found' }, { status: 404 });
}

const isBuySide = !shouldShowCanonicalPlaybook(workspace);

const existing = await getChecklistForWorkspace(workspaceId);

if (existing && !isBuySide) {
  // Sell-side: preserves the v1.3 invariant (canonical playbook IS the
  // checklist; replace via this endpoint would clobber playbook state).
  return Response.json({ error: 'Checklist already exists for this workspace' }, { status: 409 });
}

let checklist = existing;
if (existing && isBuySide) {
  // Buy-side: cascade-delete existing items, keep the checklists row, then
  // insert new items below. This is the v1.6 replace-on-reupload behavior.
  await db.delete(checklistItems).where(eq(checklistItems.checklistId, existing.id));
} else if (!existing) {
  checklist = await createChecklist(workspaceId);
}
// … rest of existing handler logic — folder mapping + item inserts + activity log.
// Use `checklist!.id` (we know it's non-null at this point).
```

(Adapt to the existing handler structure. The key changes: look up workspace first to determine `isBuySide`; on buy-side with existing checklist, delete items instead of returning 409; otherwise behavior is unchanged.)

### Step 3: TypeScript + tests

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean.

### Step 4: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/app/api/workspaces/[id]/checklist/import/route.ts
git commit -m "feat(buy-side-checklist): replace-on-reupload for buy-side; keep 409 on sell-side"
```

---

## Task 6: ReadinessPanel `mode: 'simple'` for buy-side workspaces

**This task uses `ui-ux-pro-max` for the simple-mode visual treatment.** The component contract is fixed below; ui-ux-pro-max decides typography, spacing, and the subtle visual differences from the canonical mode.

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts` — return `mode: 'simple'` on buy-side
- Modify: `cis-deal-room/src/components/workspace/ReadinessPanel.tsx` — handle simple mode
- Modify: `cis-deal-room/src/test/components/ReadinessPanel.test.tsx` — add simple-mode tests

### Step 1: Update the `/readiness` endpoint

In `cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts`:

```ts
import { shouldShowCanonicalPlaybook } from '@/lib/dal/playbook';
import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '@/db';
import { checklistItems, checklists } from '@/db/schema';

// … inside the GET handler, after auth + workspace lookup:

if (!shouldShowCanonicalPlaybook(workspace)) {
  // Buy-side: simple counter over all imported items (or the owner-filtered
  // subset for seller-side viewers).
  const checklist = await getChecklistForWorkspace(workspaceId);
  if (!checklist) {
    return Response.json({ mode: 'simple', total: 0, ready: 0 });
  }

  // Get the viewer's owner-filter scope (mirror of listItemsForViewer)
  const ownerFilter = ownerFilterForSession({
    isAdmin: session.isAdmin,
    role,
    shadowSide,
    cisAdvisorySide: workspace.cisAdvisorySide,
  });

  // Empty filter = nothing visible
  if (ownerFilter !== null && ownerFilter.length === 0) {
    return Response.json({ mode: 'simple', total: 0, ready: 0 });
  }

  const baseWhere = ownerFilter === null
    ? eq(checklistItems.checklistId, checklist.id)
    : and(eq(checklistItems.checklistId, checklist.id), inArray(checklistItems.owner, ownerFilter));

  const [{ count: total }] = await db
    .select({ count: count() })
    .from(checklistItems)
    .where(baseWhere);

  const [{ count: ready }] = await db
    .select({ count: count() })
    .from(checklistItems)
    .where(
      and(
        baseWhere,
        inArray(checklistItems.status, ['received', 'waived', 'n_a']),
      ),
    );

  return Response.json({ mode: 'simple', total: Number(total), ready: Number(ready) });
}

// Sell-side path: existing v1.4 behavior — return { mode: 'canonical', ... }.
```

(Adapt to the existing handler shape. The sell-side response should now include `mode: 'canonical'` as a discriminator field. Minor backward-compat tweak: the v1.4 response didn't have a `mode` field at all. Adding it is additive — old clients ignore unknown fields. New clients use `mode` to discriminate.)

### Step 2: Update the existing /readiness response to include `mode: 'canonical'`

In the same file, find the existing v1.4 sell-side response. Add `mode: 'canonical'` as a field:

```ts
return Response.json({
  mode: 'canonical' as const,
  total,
  ready,
  byCategory,
  byStage,
  dealKillerGroups,
});
```

### Step 3: Update existing API tests if any check the readiness shape

If there are tests that match the v1.4 readiness response without a `mode` field, add the `mode: 'canonical'` field to the expectations. Run the suite to find any:

```bash
cd cis-deal-room && npx vitest run
```

Fix any failures by adding `mode: 'canonical'` to the expected response shape.

### Step 4: Failing component tests for simple mode

Append to `cis-deal-room/src/test/components/ReadinessPanel.test.tsx`:

```ts
describe('ReadinessPanel — simple mode (buy-side)', () => {
  it('renders the simple counter with total and ready counts', () => {
    render(
      <ReadinessPanel
        summary={{ mode: 'simple', total: 24, ready: 5 }}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText(/5 \/ 24/)).toBeInTheDocument();
    expect(screen.getByText(/Items received/i)).toBeInTheDocument();
  });

  it('does NOT render deal-killer chips in simple mode', () => {
    render(
      <ReadinessPanel
        summary={{ mode: 'simple', total: 24, ready: 5 }}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.queryByText('Cap Table')).not.toBeInTheDocument();
    expect(screen.queryByText('83(b) Filings')).not.toBeInTheDocument();
  });

  it('does NOT render stage rows in simple mode', () => {
    render(
      <ReadinessPanel
        summary={{ mode: 'simple', total: 24, ready: 5 }}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.queryByText('Stage 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Stage 4')).not.toBeInTheDocument();
  });

  it('shows 0/0 when no items', () => {
    render(
      <ReadinessPanel
        summary={{ mode: 'simple', total: 0, ready: 0 }}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText(/0 \/ 0/)).toBeInTheDocument();
  });
});
```

### Step 5: Run, confirm fail

```bash
cd cis-deal-room && npx vitest run src/test/components/ReadinessPanel.test.tsx
```

Expected: 4 new tests fail (component doesn't yet support `mode` discriminator).

### Step 6: Invoke `ui-ux-pro-max` for the simple-mode visual treatment

Use the `Skill` tool with `skill: ui-ux-pro-max` and provide this design brief:

> Design the visual treatment for a NEW "simple mode" of the existing `ReadinessPanel` component. This mode renders on buy-side advisory workspaces; the existing canonical-mode rendering (5 deal-killer chips + 4 stage rows + 6 per-category bars) does NOT apply because there are no canonical items.
>
> Simple mode contents:
> 1. Headline: "Items received: X / N (Y%)" — same eyebrow + big number pattern as canonical mode but with different label
> 2. A single thin progress bar across full width (filled to ready/total ratio)
> 3. "Open checklist" link top-right (same as canonical mode)
> 4. Nothing else — no chips, no stage rows, no category breakdown
>
> Empty state (total=0): "No checklist uploaded yet" with a soft prompt to import. Headline number reads "0 / 0" with no progress bar (or a fully empty bar).
>
> Constraints:
> - Existing dark + brand-red design language (`text-text-primary`, `text-text-secondary`, `text-text-muted`, `bg-surface`, `bg-surface-sunken`, `border-border`, `text-accent`)
> - Match the existing canonical-mode panel's outer container (`section` with `border border-border rounded-xl bg-surface p-5`)
> - Component file: `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`
> - Same height-budget feel as canonical mode (the panel shouldn't dramatically shrink — it's still a visual anchor on DealOverview, just simpler)
> - Mobile/narrow viewport: single column stack
>
> Output the recommended Tailwind classes for the simple-mode header, progress bar, and empty state.

Apply ui-ux-pro-max's visual decisions when writing the implementation in Step 7.

### Step 7: Implement the simple mode

Modify `cis-deal-room/src/components/workspace/ReadinessPanel.tsx` to handle the discriminated `summary` type:

```tsx
type Summary =
  | {
      mode: 'canonical';
      total: number;
      ready: number;
      byStage: Record<1 | 2 | 3 | 4, { total: number; ready: number; label: string; dayRange: string }>;
      dealKillerGroups: Array<{ group: DealKillerGroup; color: ChipColor }>;
    }
  | {
      mode: 'simple';
      total: number;
      ready: number;
    };

interface Props {
  summary: Summary;
  onOpenChecklist: () => void;
  onChipClick: (group: DealKillerGroup) => void;
  onStageClick: (stage: Stage) => void;
}

export function ReadinessPanel({ summary, onOpenChecklist, onChipClick, onStageClick }: Props) {
  const pct = summary.total === 0 ? 0 : Math.round((summary.ready / summary.total) * 100);

  if (summary.mode === 'simple') {
    return (
      <section className="border border-border rounded-xl bg-surface p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
              Items received
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {summary.ready} / {summary.total}{' '}
              <span className="text-base font-normal text-text-muted">({pct}%)</span>
            </div>
          </div>
          <button
            onClick={onOpenChecklist}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Open checklist
            <ArrowRight size={14} />
          </button>
        </div>

        {summary.total > 0 && (
          <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-700/50 motion-safe:transition-[width] motion-safe:duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {summary.total === 0 && (
          <div className="text-xs text-text-muted">
            No checklist uploaded yet. Open the checklist tab to import a CSV or XLSX request list.
          </div>
        )}
      </section>
    );
  }

  // Canonical mode — existing v1.4 layout, unchanged.
  // … existing render block …
}
```

Apply ui-ux-pro-max's typography/spacing decisions on top of this baseline.

### Step 8: Run tests + tsc

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: 4 new simple-mode tests pass + canonical-mode tests still pass.

### Step 9: Commit

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts \
        cis-deal-room/src/components/workspace/ReadinessPanel.tsx \
        cis-deal-room/src/test/components/ReadinessPanel.test.tsx
git commit -m "feat(buy-side-checklist): ReadinessPanel simple mode + /readiness mode discriminator"
```

---

## Task 7: Apply migration to shared DB + manual E2E + push + PR

**No code changes — verification + ship.**

### Step 1: Apply migration 0015 to the shared preview/prod DB

The user (controller) handles this step:

```bash
cd cis-deal-room && DATABASE_URL='<shared-preview-url>' node scripts/apply-0015-direct.mjs
```

Expected: prints the count of canonical-overlay rows on buy-side workspaces, deletes them, verifies 0 remaining.

### Step 2: Final tsc + tests

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

### Step 3: Manual E2E on local dev

```bash
cd cis-deal-room && npm run dev
```

**Buy-side workspace flow:**
1. Open Project Chronos (existing buy-side workspace) → Checklist tab
2. Verify: NO 48-item canonical overlay (only the 79 originally imported items show, since the migration cleaned up canonical-overlay rows)
3. DealOverview readiness panel: shows simple "Items received: X / Y" counter, no deal-killer chips, no stage rows
4. Click Import → modal accepts both .csv and .xlsx; drop the test CSV (`cis-deal-room/test-fixtures/sample-buy-side-request-list.csv` — create one if needed for testing)
5. Items replace the 79 existing → new items appear in `ChecklistTable`
6. Re-import again with a different CSV → confirms replace-on-reupload

**Sell-side workspace flow (regression):**
1. Open a sell-side workspace (Project Avelia or similar)
2. Checklist tab: still shows 48-item canonical playbook with all v1.3-v1.4 features intact
3. DealOverview readiness panel: 5 deal-killer chips + 4 stage rows (canonical mode)
4. Try to import on sell-side → returns 409 (preserves v1.3 invariant)

**Cap table flow on both sides:**
1. Cap table page works identically on buy-side and sell-side
2. Publish on a buy-side workspace → no item-5 update (no canonical items to update — by design)

### Step 4: Push + PR

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git push -u origin feat/buy-side-checklist

gh pr create --title "feat(buy-side-checklist): custom checklist upload for buy-side workspaces (v1.6)" --body "$(cat <<'EOF'
## Summary

On buy-side advisory workspaces, skip the canonical 48-item Data Room Construction Playbook entirely. Admins upload their own request list (.csv or .xlsx). Sell-side workspaces are unchanged.

The reframe: the canonical playbook is a sell-side prep tool. On buy-side, items are framed as "we're requesting from the seller" — every deal has a different target and a different request list. The existing PR #8 import flow is extended to accept CSV in addition to XLSX, and re-upload replaces existing items.

- **DAL**: new \`shouldShowCanonicalPlaybook(workspace)\` helper; \`ensureChecklistForWorkspace\` no-ops on buy-side
- **API**: \`GET /checklist\` returns \`{ checklist, items }\` shape on buy-side, \`{ checklist, playbook }\` on sell-side; \`GET /readiness\` returns \`mode: 'simple'\` on buy-side, \`mode: 'canonical'\` on sell-side; \`POST /checklist/import\` replaces on buy-side, keeps 409 on sell-side
- **Parser**: renamed \`parse-xlsx.ts\` → \`parse-checklist-file.ts\`; accepts both \`.csv\` and \`.xlsx\` via the \`xlsx\` library
- **UI**: \`ChecklistImportModal\` accepts both formats in the dropzone; \`ReadinessPanel\` adds a simple-mode rendering (single counter + thin bar) for buy-side. Designed via \`ui-ux-pro-max\`
- **Migration 0015**: one-time data cleanup deleting canonical-overlay \`checklist_items\` rows on buy-side workspaces; preserves any custom items (e.g., Project Chronos's 79 originally-imported items stay)

## Test plan

- [ ] Apply migration 0015 to preview DB
- [ ] Buy-side workspace (Project Chronos): Checklist tab no longer shows the 48-item canonical playbook; only original 79 imported items remain
- [ ] Buy-side workspace: DealOverview readiness shows simple "Items received: X / N" counter, no deal-killer chips, no stage rows
- [ ] Import a CSV on a buy-side workspace → items replace existing → ChecklistTable reflects new content
- [ ] Re-import an XLSX on the same buy-side workspace → items replaced again
- [ ] Sell-side workspace: full v1.3-v1.4 behavior unchanged (48-item playbook + 5 chips + 4 stage rows)
- [ ] Sell-side import attempt → still returns 409 (preserves v1.3 invariant)
- [ ] Cap table works identically on both advisory sides

## Out of scope (deferred)

- Named/reusable template library
- Built-in "Buy-side Standard Request List" template
- Per-workspace toggle to override the smart-default
- Cap table publish coupling to a custom checklist item

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 5: Done

PR created. After review/merge, production gets the buy-side custom checklist feature.

---

## Self-Review Notes

- **Spec coverage:**
  - §3 architecture (no schema changes, helper, route branches, parser rename, replace-on-reupload, auto-create skip) → Tasks 2, 3, 5
  - §3 migration → Task 1
  - §4 components (ChecklistView already routes correctly; ChecklistImportModal accept attribute; ReadinessPanel simple mode) → Tasks 4, 6
  - §5 data flow → end-to-end across all tasks
  - §6 visibility table → preserved by reusing PR #8 ownerFilterForSession
  - §7 migration strategy → Task 1 + Task 7 step 1
  - §8 testing → tests defined per task
  - §9 open questions → resolved: (a) re-upload UI lives in same ChecklistImportModal flow; (b) detection is server-side via workspace lookup; (c) parser rename only affects the preview route — verified
- **Placeholder scan:** No "TBD" / "TODO" / "fill in later" / "add appropriate". Every step has concrete code or commands.
- **Type consistency:** `shouldShowCanonicalPlaybook` signature consistent across Tasks 2, 5, 6. `Summary` discriminated union in `ReadinessPanel` matches the API response shape from Task 6 step 1. `parseChecklistFile` signature matches across Tasks 3 and consumer endpoints.

---

**Plan complete.**
