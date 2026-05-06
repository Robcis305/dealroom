# Stage Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the readiness panel's 6 per-category bars with 4 per-stage bars (Day 1-3 → Day 15-21), reframing diligence prep around the playbook's stage sequence. Each stage is independent (its own progress %); clicking a stage drills into the checklist tab and scrolls to the relevant section.

**Architecture:** Stage is derived from category via a static mapping (no schema change). `getReadinessSummary` adds a `byStage` aggregation alongside the existing `byCategory`. `ReadinessPanel` renders 4 stage progress bars instead of 6 category bars. The existing chip → scroll → outline pulse mechanism (PR #13) is generalized to support stage drill-down. `PlaybookChecklistView` adds stage-prefix labels above the first category section in each stage.

**Tech Stack:** Next.js 16 (App Router) + React + TypeScript + TailwindCSS + Drizzle ORM + Vitest/RTL/jsdom.

**Codebase notes:**
- App in `cis-deal-room/`. Branch is `feat/stage-timeline` — do NOT switch branches.
- Stack constraints: Next.js 16 (`params` is a Promise in route handlers; consult `node_modules/next/dist/docs/01-app/` if in doubt).
- The v1.3 playbook DAL lives at `cis-deal-room/src/lib/dal/playbook.ts`. The 6-bar `ReadinessPanel` lives at `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`. The chip-deep-link state pattern (`pendingHighlight`) is in `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` and is currently typed as `DealKillerGroup | null` — we generalize it to a discriminated union.
- **All UI work in this plan MUST be designed using the `ui-ux-pro-max` skill** before writing the final Tailwind classes / motion / spacing / focus states. Invoke it at Step 3 of any task that creates or significantly restructures a component (Tasks 5 and 6). The component shape, props, and data flow described in the task are the contract; the visual treatment is decided by ui-ux-pro-max within the existing dark + brand-red language documented in `.impeccable.md` and `design-system/cis-deal-room/MASTER.md`.
- Spec: `docs/superpowers/specs/2026-05-06-stage-timeline-design.md`.

**Tests run from `cis-deal-room/` via `npx vitest run`. Tsc clean is `npx tsc --noEmit`.**

---

## Phase 1: DAL — Stage type and aggregation

### Task 1: Add Stage type + category-to-stage mapping + extend ReadinessSummary type

**Files:**
- Modify: `cis-deal-room/src/lib/dal/playbook.ts` — add new exports and extend the `ReadinessSummary` interface (do NOT change `getReadinessSummary` body in this task; that's Task 2)
- Test: `cis-deal-room/src/test/dal/playbook.test.ts` — add a mapping-completeness test

- [ ] **Step 1: Append the failing test**

Append to `cis-deal-room/src/test/dal/playbook.test.ts` (after the existing `describe` blocks, do not delete anything):

```ts
describe('CATEGORY_TO_STAGE mapping', () => {
  it('covers all 6 canonical categories with no gaps', async () => {
    const { CATEGORY_TO_STAGE } = await import('@/lib/dal/playbook');

    expect(CATEGORY_TO_STAGE.corporate_legal).toBe(1);
    expect(CATEGORY_TO_STAGE.financial).toBe(2);
    expect(CATEGORY_TO_STAGE.commercial).toBe(3);
    expect(CATEGORY_TO_STAGE.team_hr).toBe(4);
    expect(CATEGORY_TO_STAGE.ip_technical).toBe(4);
    expect(CATEGORY_TO_STAGE.operations_risk).toBe(4);
  });
});

describe('STAGE_META', () => {
  it('exposes label + dayRange for each of the 4 stages', async () => {
    const { STAGE_META } = await import('@/lib/dal/playbook');

    expect(STAGE_META[1]).toEqual({ label: 'Cap & Corp', dayRange: 'Day 1-3' });
    expect(STAGE_META[2]).toEqual({ label: 'Financial', dayRange: 'Day 3-10' });
    expect(STAGE_META[3]).toEqual({ label: 'Commercial', dayRange: 'Day 10-15' });
    expect(STAGE_META[4]).toEqual({ label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 2 new tests fail with "CATEGORY_TO_STAGE is not exported" / "STAGE_META is not exported".

- [ ] **Step 3: Add the constants and extend the type**

In `cis-deal-room/src/lib/dal/playbook.ts`, add the following near the top (below the existing `PlaybookCategory` and `DealKillerGroup` type exports — those are around lines 8-22):

```ts
export type Stage = 1 | 2 | 3 | 4;

export const CATEGORY_TO_STAGE: Record<PlaybookCategory, Stage> = {
  corporate_legal: 1,
  financial: 2,
  commercial: 3,
  team_hr: 4,
  ip_technical: 4,
  operations_risk: 4,
};

export const STAGE_META: Record<Stage, { label: string; dayRange: string }> = {
  1: { label: 'Cap & Corp', dayRange: 'Day 1-3' },
  2: { label: 'Financial', dayRange: 'Day 3-10' },
  3: { label: 'Commercial', dayRange: 'Day 10-15' },
  4: { label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
};
```

In the same file, find the `ReadinessSummary` interface (currently has `total`, `ready`, `byCategory`, `dealKillerGroups`) and add `byStage`:

```ts
export interface ReadinessSummary {
  total: number;
  ready: number;
  byCategory: Record<PlaybookCategory, { total: number; ready: number }>;
  byStage: Record<Stage, { total: number; ready: number; label: string; dayRange: string }>;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    status: ChecklistStatus;
    color: DealKillerGroupStatus;
    members: Array<{ playbookItemId: string; number: number; status: ChecklistStatus }>;
  }>;
}
```

(Keep the existing fields. The `dealKillerGroups` interior shape may already be defined — leave it unchanged. Only ADD `byStage`.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: the 2 new tests now PASS. The existing `getReadinessSummary` tests will FAIL because the function doesn't yet return `byStage` — that's expected and fixed in Task 2. Note the count of failing tests; should be only the existing readiness ones.

- [ ] **Step 5: Run tsc to confirm types compile**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: clean (no new errors). Pre-existing `checklist.test.ts:125` was fixed in PR #13 — confirm tsc shows zero errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/lib/dal/playbook.ts cis-deal-room/src/test/dal/playbook.test.ts
git commit -m "feat(stage-timeline): export Stage type + CATEGORY_TO_STAGE + STAGE_META"
```

---

### Task 2: Extend `getReadinessSummary` to compute `byStage`

**Files:**
- Modify: `cis-deal-room/src/lib/dal/playbook.ts` — update the function body
- Test: `cis-deal-room/src/test/dal/playbook.test.ts` — add aggregation tests

- [ ] **Step 1: Append failing tests**

Append to `cis-deal-room/src/test/dal/playbook.test.ts`:

```ts
describe('getReadinessSummary.byStage', () => {
  it('returns zeroed byStage when no items', async () => {
    dbResults.playbook_join = [];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.byStage[1]).toEqual({ total: 0, ready: 0, label: 'Cap & Corp', dayRange: 'Day 1-3' });
    expect(summary.byStage[2]).toEqual({ total: 0, ready: 0, label: 'Financial', dayRange: 'Day 3-10' });
    expect(summary.byStage[3]).toEqual({ total: 0, ready: 0, label: 'Commercial', dayRange: 'Day 10-15' });
    expect(summary.byStage[4]).toEqual({ total: 0, ready: 0, label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' });
  });

  it('rolls Stage 4 across team_hr + ip_technical + operations_risk', async () => {
    const baseRow = (category: string, status: string | null) => ({
      playbookItemId: `pb-${category}`,
      number: 1,
      category,
      name: 'X',
      rationale: 'r',
      dealKillerGroup: null,
      defaultPriority: 'medium',
      sortOrder: 1,
      itemId: status ? 'ci' : null,
      status,
      owner: status ? 'seller' : null,
      priority: 'medium',
      notes: null,
      receivedAt: null,
      folderId: null,
    });
    dbResults.playbook_join = [
      baseRow('team_hr', 'received'),
      baseRow('team_hr', null),
      baseRow('ip_technical', 'waived'),
      baseRow('ip_technical', null),
      baseRow('operations_risk', 'received'),
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.byStage[4].total).toBe(5);
    expect(summary.byStage[4].ready).toBe(3); // 2 received + 1 waived; 2 nulls treated as not_started
  });

  it('counts received/waived/n_a as ready in byStage exactly like byCategory', async () => {
    dbResults.playbook_join = [
      {
        playbookItemId: 'pb-x', number: 1, category: 'financial',
        name: 'X', rationale: 'r', dealKillerGroup: null,
        defaultPriority: 'medium', sortOrder: 1,
        itemId: 'ci', status: 'received', owner: 'seller',
        priority: 'medium', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-y', number: 2, category: 'financial',
        name: 'Y', rationale: 'r', dealKillerGroup: null,
        defaultPriority: 'medium', sortOrder: 2,
        itemId: 'ci', status: 'blocked', owner: 'seller',
        priority: 'medium', notes: null, receivedAt: null, folderId: null,
      },
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    // byCategory and byStage[2] (financial) should agree on financial counts.
    expect(summary.byCategory.financial.total).toBe(2);
    expect(summary.byCategory.financial.ready).toBe(1);
    expect(summary.byStage[2].total).toBe(2);
    expect(summary.byStage[2].ready).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: 3 new tests fail (and existing readiness tests still fail because the function doesn't return `byStage` yet).

- [ ] **Step 3: Update `getReadinessSummary`**

Find `export async function getReadinessSummary` in `cis-deal-room/src/lib/dal/playbook.ts`. Add a `byStage` accumulator and populate it inside the existing `for (const row of view.canonical)` loop.

Replace the existing function with:

```ts
export async function getReadinessSummary(checklistId: string): Promise<ReadinessSummary> {
  const view = await getPlaybookView(checklistId);

  const byCategory: ReadinessSummary['byCategory'] = {
    corporate_legal: { total: 0, ready: 0 },
    financial: { total: 0, ready: 0 },
    commercial: { total: 0, ready: 0 },
    team_hr: { total: 0, ready: 0 },
    ip_technical: { total: 0, ready: 0 },
    operations_risk: { total: 0, ready: 0 },
  };

  const byStage: ReadinessSummary['byStage'] = {
    1: { total: 0, ready: 0, label: STAGE_META[1].label, dayRange: STAGE_META[1].dayRange },
    2: { total: 0, ready: 0, label: STAGE_META[2].label, dayRange: STAGE_META[2].dayRange },
    3: { total: 0, ready: 0, label: STAGE_META[3].label, dayRange: STAGE_META[3].dayRange },
    4: { total: 0, ready: 0, label: STAGE_META[4].label, dayRange: STAGE_META[4].dayRange },
  };

  let total = 0;
  let ready = 0;
  for (const row of view.canonical) {
    total += 1;
    byCategory[row.category].total += 1;
    const stage = CATEGORY_TO_STAGE[row.category];
    byStage[stage].total += 1;
    if (READY_STATUSES.has(row.status)) {
      ready += 1;
      byCategory[row.category].ready += 1;
      byStage[stage].ready += 1;
    }
  }

  // Group deal-killer items by group, take worst-of status
  const grouped = new Map<DealKillerGroup, PlaybookCanonicalRow[]>();
  for (const row of view.canonical) {
    if (row.dealKillerGroup) {
      const list = grouped.get(row.dealKillerGroup) ?? [];
      list.push(row);
      grouped.set(row.dealKillerGroup, list);
    }
  }

  const dealKillerGroups = Array.from(grouped.entries()).map(([group, members]) => {
    const worst = members.reduce<ChecklistStatus>(
      (acc, m) => (STATUS_RANK[m.status] > STATUS_RANK[acc] ? m.status : acc),
      'received' as ChecklistStatus,
    );
    return {
      group,
      status: worst,
      color: statusToColor(worst),
      members: members.map((m) => ({
        playbookItemId: m.playbookItemId,
        number: m.number,
        status: m.status,
      })),
    };
  });

  const ORDER: DealKillerGroup[] = [
    'cap_table',
    'eighty_three_b',
    'customer_coc',
    'ip_assignment',
    'revenue_bridge',
  ];
  dealKillerGroups.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

  return { total, ready, byCategory, byStage, dealKillerGroups };
}
```

(The change from the prior version is: declaration of `byStage`, its population inside the loop, and including it in the return object. The deal-killer-group logic is unchanged — keep it as-is.)

- [ ] **Step 4: Run tests, verify all pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/playbook.test.ts
```

Expected: all tests pass (the 3 new byStage ones + all pre-existing readiness ones).

- [ ] **Step 5: Run full suite to catch regressions**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/lib/dal/playbook.ts cis-deal-room/src/test/dal/playbook.test.ts
git commit -m "feat(stage-timeline): aggregate readiness by stage in getReadinessSummary"
```

---

## Phase 2: API — empty-state byStage response

### Task 3: Update `/readiness` empty response to include populated `byStage`

The current `/readiness` route returns an empty zero-shape when the workspace has no checklist. Since v1.3 added auto-creation of the checklist row for playbook-eligible viewers, this empty path is mostly cold; but we keep it correct for completeness (e.g., during error recovery or for non-eligible role hits that fall through).

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts`

- [ ] **Step 1: Read the existing handler**

```bash
cat cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts
```

Locate the early-return that responds with the empty zero-shape (when `!checklist`). Currently it returns `{ total: 0, ready: 0, byCategory: {…all zeros…}, dealKillerGroups: [] }`.

- [ ] **Step 2: Update the empty response to include byStage**

Add the import for `STAGE_META`:

```ts
import { getReadinessSummary, STAGE_META } from '@/lib/dal/playbook';
```

(If the file already imports from `@/lib/dal/playbook`, just add `STAGE_META` to the existing import line.)

Replace the empty-state Response.json body to include `byStage`:

```ts
if (!checklist) {
  return Response.json({
    total: 0,
    ready: 0,
    byCategory: {
      corporate_legal: { total: 0, ready: 0 },
      financial: { total: 0, ready: 0 },
      commercial: { total: 0, ready: 0 },
      team_hr: { total: 0, ready: 0 },
      ip_technical: { total: 0, ready: 0 },
      operations_risk: { total: 0, ready: 0 },
    },
    byStage: {
      1: { total: 0, ready: 0, label: STAGE_META[1].label, dayRange: STAGE_META[1].dayRange },
      2: { total: 0, ready: 0, label: STAGE_META[2].label, dayRange: STAGE_META[2].dayRange },
      3: { total: 0, ready: 0, label: STAGE_META[3].label, dayRange: STAGE_META[3].dayRange },
      4: { total: 0, ready: 0, label: STAGE_META[4].label, dayRange: STAGE_META[4].dayRange },
    },
    dealKillerGroups: [],
  });
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/app/api/workspaces/[id]/readiness/route.ts
git commit -m "feat(stage-timeline): include byStage in empty /readiness response"
```

---

## Phase 3: UI — generalize highlight pattern, restructure ReadinessPanel, add stage labels

### Task 4: Generalize `pendingHighlight` from `DealKillerGroup` to a discriminated union

The chip → scroll → outline pulse mechanism (PR #13) currently passes `highlightGroup: DealKillerGroup | null` from `WorkspaceShell` → `ChecklistView` → `PlaybookChecklistView`. To support stage drill-down, generalize the prop to `highlightTarget: PendingHighlight | null` where `PendingHighlight` is a discriminated union.

This is a structural rename across 3 files; no behavior change for the existing deal-killer chip flow (yet).

**Files:**
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`
- Modify: `cis-deal-room/src/components/workspace/ChecklistView.tsx`
- Modify: `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`

- [ ] **Step 1: Define the PendingHighlight type**

In `cis-deal-room/src/lib/dal/playbook.ts`, add a new exported type (next to `Stage`):

```ts
export type PendingHighlight =
  | { kind: 'deal_killer'; group: DealKillerGroup }
  | { kind: 'stage'; stage: Stage };
```

Also re-export from `cis-deal-room/src/types/index.ts` so components can import from a stable path. Add at the bottom of the file:

```ts
export type { PendingHighlight, Stage } from '@/lib/dal/playbook';
```

- [ ] **Step 2: Generalize `WorkspaceShell` state**

In `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`, find the line:

```ts
const [pendingHighlight, setPendingHighlight] = useState<DealKillerGroup | null>(null);
```

Change the type to `PendingHighlight | null`:

```ts
const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);
```

Update the `DealKillerGroup` import to also include `PendingHighlight`:

```ts
import type { DealKillerGroup, PendingHighlight } from '@/types';
```

Find the existing chip handler — currently it calls `setPendingHighlight(group)`. Wrap the value as a discriminated tag:

```ts
onChipClick={(group: DealKillerGroup) => {
  setPendingHighlight({ kind: 'deal_killer', group });
  setView({ kind: 'checklist' });
}}
```

Find where `<ChecklistView ... highlightGroup={pendingHighlight} ... />` is rendered. Rename the prop to `highlightTarget`:

```tsx
highlightTarget={pendingHighlight}
onHighlightConsumed={() => setPendingHighlight(null)}
```

- [ ] **Step 3: Pass-through `ChecklistView`**

In `cis-deal-room/src/components/workspace/ChecklistView.tsx`, the existing `Props` has `highlightGroup?: DealKillerGroup | null`. Replace with:

```ts
import type { PendingHighlight } from '@/types';

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  onChanged?: () => void;
  onUploadForItem: (folderId: string | null, itemId: string, itemName: string) => void;
  folders: Array<{ id: string; name: string }>;
  highlightTarget?: PendingHighlight | null;
  onHighlightConsumed?: () => void;
}
```

(Drop `highlightGroup` from the destructure; add `highlightTarget`.)

Update the destructure in the function signature and pass `highlightTarget` to `PlaybookChecklistView`:

```tsx
export function ChecklistView({ workspaceId, isAdmin, onChanged, onUploadForItem, folders, highlightTarget, onHighlightConsumed }: Props) {
  // … existing body unchanged except the PlaybookChecklistView render:
  return (
    <PlaybookChecklistView
      // … existing props …
      highlightTarget={highlightTarget}
      onHighlightConsumed={onHighlightConsumed}
    />
  );
  // …
}
```

- [ ] **Step 4: Update `PlaybookChecklistView`**

In `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`, replace the `highlightGroup` prop and its `useEffect`:

```ts
import type { PendingHighlight } from '@/types';

interface Props {
  // … existing props …
  highlightTarget?: PendingHighlight | null;
  onHighlightConsumed?: () => void;
}
```

Replace the existing `useEffect` that watches `highlightGroup` with one that watches `highlightTarget` and dispatches by `kind`:

```tsx
useEffect(() => {
  if (!highlightTarget) return;

  let target: HTMLElement | null = null;
  if (highlightTarget.kind === 'deal_killer') {
    target = document.querySelector<HTMLElement>(
      `[data-deal-killer-group="${highlightTarget.group}"]`,
    );
  } else if (highlightTarget.kind === 'stage') {
    // First section header in this stage (data-stage-first="true")
    target = document.querySelector<HTMLElement>(
      `[data-stage="${highlightTarget.stage}"][data-stage-first="true"]`,
    );
  }

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-base');
    const timer = setTimeout(() => {
      target!.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-base');
      onHighlightConsumed?.();
    }, 2000);
    return () => clearTimeout(timer);
  }
  onHighlightConsumed?.();
}, [highlightTarget, onHighlightConsumed]);
```

(Note: `ring-offset-base` may not be a Tailwind theme color in this project — verify against existing usage. If it isn't, use whatever the existing `ChecklistStatusChip.tsx` and v1.3 work used; the chip pulse already runs on this codebase.)

- [ ] **Step 5: Run tests + tsc**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean. The existing `PlaybookChecklistView.test.tsx` doesn't pass `highlightGroup` / `highlightTarget`, so it should be unaffected.

- [ ] **Step 6: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/lib/dal/playbook.ts \
        cis-deal-room/src/types/index.ts \
        cis-deal-room/src/components/workspace/WorkspaceShell.tsx \
        cis-deal-room/src/components/workspace/ChecklistView.tsx \
        cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx
git commit -m "refactor(playbook): generalize chip-deep-link to PendingHighlight discriminated union"
```

---

### Task 5: Restructure `ReadinessPanel` to render 4 stage bars

**Visual treatment for this task MUST be designed via the `ui-ux-pro-max` skill.** The component contract (props, data shape, click behavior) is fixed below; the typography, spacing, motion, focus rings, and small-screen behavior are decided by ui-ux-pro-max. Invoke the skill in Step 3.

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`
- Modify: `cis-deal-room/src/test/components/ReadinessPanel.test.tsx`

- [ ] **Step 1: Update the test file with the new contract**

Replace the contents of `cis-deal-room/src/test/components/ReadinessPanel.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessPanel } from '@/components/workspace/ReadinessPanel';

const summary = {
  total: 48,
  ready: 12,
  byCategory: {
    corporate_legal: { total: 11, ready: 5 },
    financial: { total: 11, ready: 3 },
    commercial: { total: 9, ready: 2 },
    team_hr: { total: 7, ready: 1 },
    ip_technical: { total: 8, ready: 1 },
    operations_risk: { total: 2, ready: 0 },
  },
  byStage: {
    1: { total: 11, ready: 5, label: 'Cap & Corp', dayRange: 'Day 1-3' },
    2: { total: 11, ready: 3, label: 'Financial', dayRange: 'Day 3-10' },
    3: { total: 9, ready: 2, label: 'Commercial', dayRange: 'Day 10-15' },
    4: { total: 17, ready: 2, label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
  },
  dealKillerGroups: [
    { group: 'cap_table' as const, status: 'received' as const, color: 'green' as const, members: [] },
    { group: 'eighty_three_b' as const, status: 'blocked' as const, color: 'red' as const, members: [] },
    { group: 'customer_coc' as const, status: 'in_progress' as const, color: 'yellow' as const, members: [] },
    { group: 'ip_assignment' as const, status: 'not_started' as const, color: 'gray' as const, members: [] },
    { group: 'revenue_bridge' as const, status: 'received' as const, color: 'green' as const, members: [] },
  ],
};

describe('ReadinessPanel', () => {
  it('renders the score headline', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText(/12 \/ 48/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it('renders all 5 deal-killer chips', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText('Cap Table')).toBeInTheDocument();
    expect(screen.getByText('83(b) Filings')).toBeInTheDocument();
    expect(screen.getByText('Customer COC')).toBeInTheDocument();
    expect(screen.getByText('IP Assignments')).toBeInTheDocument();
    expect(screen.getByText('Revenue Bridge')).toBeInTheDocument();
  });

  it('renders 4 stage rows with labels and day ranges', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText('Cap & Corp')).toBeInTheDocument();
    expect(screen.getByText('Day 1-3')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
    expect(screen.getByText('Day 3-10')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('Day 10-15')).toBeInTheDocument();
    expect(screen.getByText('Legal · IP · HR · Ops')).toBeInTheDocument();
    expect(screen.getByText('Day 15-21')).toBeInTheDocument();
  });

  it('shows count text for each stage bar', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    // Stage 1: 5 / 11
    expect(screen.getByText('5/11')).toBeInTheDocument();
    // Stage 2: 3 / 11 — text is "3/11"
    expect(screen.getAllByText('3/11').length).toBeGreaterThanOrEqual(1);
    // Stage 4: 2 / 17
    expect(screen.getByText('2/17')).toBeInTheDocument();
  });

  it('fires onStageClick with the stage number when a stage row is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    let clicked: number | null = null;
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={(stage) => { clicked = stage; }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /stage 1/i }));
    expect(clicked).toBe(1);
  });

  it('does NOT render category bars (those moved to checklist tab)', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    // The old per-category short labels should not appear in the panel anymore.
    expect(screen.queryByText('Corporate')).not.toBeInTheDocument();
    expect(screen.queryByText('IP/Tech')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, verify failures**

```bash
cd cis-deal-room && npx vitest run src/test/components/ReadinessPanel.test.tsx
```

Expected: multiple new test failures (`onStageClick` not in props; "Cap & Corp" text not found; etc.).

- [ ] **Step 3: Use ui-ux-pro-max to design the visual treatment**

Before writing the component code, invoke the `ui-ux-pro-max` skill with the following design brief:

> Restructure the existing `ReadinessPanel` (dark theme, brand red `#E10600` available as `accent` Tailwind class). Headline ("12 / 48 (25%)") and 5 horizontal deal-killer chips above stay unchanged. **Replace** the bottom 6 thin per-category progress bars with **4 per-stage rows**, each showing: stage number (e.g. "Stage 1"), short label ("Cap & Corp"), day range ("Day 1-3"), a progress bar fill (`ready / total`), and a count ("5/11"). Each row is clickable; clicked rows must look interactive (cursor + hover state). Stages at 100% should be visually distinct (green fill). Keep the panel glanceable — no expansion, no nested cards. Mobile/narrow viewport: rows can stack vertically; truncate the long Stage 4 label gracefully.
>
> Constraints:
> - Match the existing dark + accent design language documented in `.impeccable.md` and `design-system/cis-deal-room/MASTER.md`.
> - Use existing Tailwind tokens (`text-text-primary`, `text-text-muted`, `bg-surface`, `border-border`, etc.).
> - Component file is `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`.
> - Component must accept these props: `summary` (the `ReadinessSummary` shape), `onOpenChecklist: () => void`, `onChipClick: (group: DealKillerGroup) => void`, `onStageClick: (stage: Stage) => void`.
> - Each stage row's accessible name must contain "Stage N" (test relies on `getByRole('button', { name: /stage 1/i })`).

Capture the visual decisions ui-ux-pro-max produces. Bring them back to write the component.

- [ ] **Step 4: Implement the component**

Replace the contents of `cis-deal-room/src/components/workspace/ReadinessPanel.tsx`:

```tsx
'use client';

import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { DealKillerGroup, Stage } from '@/types';

type ChipColor = 'green' | 'yellow' | 'red' | 'gray';

interface Summary {
  total: number;
  ready: number;
  byStage: Record<
    1 | 2 | 3 | 4,
    { total: number; ready: number; label: string; dayRange: string }
  >;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    color: ChipColor;
  }>;
}

interface Props {
  summary: Summary;
  onOpenChecklist: () => void;
  onChipClick: (group: DealKillerGroup) => void;
  onStageClick: (stage: Stage) => void;
}

const GROUP_LABEL: Record<DealKillerGroup, string> = {
  cap_table: 'Cap Table',
  eighty_three_b: '83(b) Filings',
  customer_coc: 'Customer COC',
  ip_assignment: 'IP Assignments',
  revenue_bridge: 'Revenue Bridge',
};

const COLOR_CLASS: Record<ChipColor, string> = {
  green: 'bg-emerald-950/40 text-emerald-200 border-emerald-800/60',
  yellow: 'bg-amber-950/40 text-amber-200 border-amber-800/60',
  red: 'bg-accent/20 text-accent border-accent/60',
  gray: 'bg-surface text-text-muted border-border',
};

const STAGES: Stage[] = [1, 2, 3, 4];

export function ReadinessPanel({ summary, onOpenChecklist, onChipClick, onStageClick }: Props) {
  const pct = summary.total === 0 ? 0 : Math.round((summary.ready / summary.total) * 100);

  return (
    <section className="border border-border rounded-xl bg-surface p-5 mb-6">
      {/* Headline */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Readiness
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

      {/* Deal-killer chips */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {summary.dealKillerGroups.map((g) => (
          <button
            key={g.group}
            onClick={() => onChipClick(g.group)}
            className={clsx(
              'border rounded-lg px-3 py-2 text-xs text-left transition-colors hover:opacity-90',
              COLOR_CLASS[g.color],
            )}
          >
            <div className="font-medium">{GROUP_LABEL[g.group]}</div>
          </button>
        ))}
      </div>

      {/* Per-stage rows */}
      <div className="space-y-2">
        {STAGES.map((stage) => {
          const s = summary.byStage[stage];
          const ratio = s.total === 0 ? 0 : (s.ready / s.total) * 100;
          const complete = s.total > 0 && s.ready === s.total;
          return (
            <button
              key={stage}
              onClick={() => onStageClick(stage)}
              aria-label={`Stage ${stage} · ${s.label}`}
              className="w-full flex items-center gap-3 text-xs text-left
                hover:bg-surface-sunken/40 rounded-md px-2 py-1.5 transition-colors
                focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <span className="font-mono text-text-muted shrink-0 w-12">Stage {stage}</span>
              <span className="text-text-primary shrink-0 truncate w-32 sm:w-44">{s.label}</span>
              <span className="text-text-muted shrink-0 w-20 sm:w-24">{s.dayRange}</span>
              <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full transition-all',
                    complete ? 'bg-emerald-700/70' : 'bg-emerald-700/40',
                  )}
                  style={{ width: `${ratio}%` }}
                />
              </div>
              <span className="font-mono text-text-muted text-right shrink-0 w-12">
                {s.ready}/{s.total}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

(This is the structural baseline matching the test contract. The ui-ux-pro-max output from Step 3 may refine the exact Tailwind classes, motion, focus ring, hover treatment, mobile-stack behavior, etc. — apply those refinements before committing.)

- [ ] **Step 5: Run tests + tsc**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run src/test/components/ReadinessPanel.test.tsx
```

Expected: 6 tests pass (headline, chips, stage rows, count text, click handler, no category bars).

- [ ] **Step 6: Update WorkspaceShell to pass `onStageClick`**

In `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` and/or `cis-deal-room/src/components/workspace/DealOverview.tsx` (whichever renders the ReadinessPanel), find the `<ReadinessPanel ... />` invocation and add the new prop:

```tsx
<ReadinessPanel
  summary={summary}
  onOpenChecklist={onOpenChecklist}
  onChipClick={(group) => {
    setPendingHighlight({ kind: 'deal_killer', group });
    setView({ kind: 'checklist' });
  }}
  onStageClick={(stage) => {
    setPendingHighlight({ kind: 'stage', stage });
    setView({ kind: 'checklist' });
  }}
/>
```

(The exact integration depends on whether `setPendingHighlight` and `setView` are in the same component or passed down via props — match the existing pattern.)

- [ ] **Step 7: Verify full test suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/components/workspace/ReadinessPanel.tsx \
        cis-deal-room/src/test/components/ReadinessPanel.test.tsx \
        cis-deal-room/src/components/workspace/WorkspaceShell.tsx \
        cis-deal-room/src/components/workspace/DealOverview.tsx
git commit -m "feat(stage-timeline): ReadinessPanel renders 4 per-stage progress bars"
```

(If `DealOverview.tsx` wasn't actually changed, drop it from the add list.)

---

### Task 6: Add stage-prefix labels and `data-stage` attributes to `PlaybookChecklistView`

Each category section header in the checklist gets a `data-stage` attribute (for the drill-down query selector) and a stage-prefix label that renders only on the FIRST category in each stage. Stage 4's three categories share the same stage prefix — only "Team & HR" gets it; "IP & Technical" and "Operations & Risk" continue silently.

**Visual treatment MUST be designed via `ui-ux-pro-max`.** The shape and data attributes are fixed below; ui-ux-pro-max decides the typography (size/weight/spacing of "STAGE 4 · DAY 15-21" relative to the category name "Team & HR" beneath it).

**Files:**
- Modify: `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`
- Modify: `cis-deal-room/src/test/components/PlaybookChecklistView.test.tsx`

- [ ] **Step 1: Append failing tests**

Append to `cis-deal-room/src/test/components/PlaybookChecklistView.test.tsx`:

```tsx
describe('PlaybookChecklistView stage prefix headers', () => {
  it('renders STAGE 1 prefix only above corporate_legal section', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-1', number: 1, category: 'corporate_legal',
            name: 'Cert', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 1,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-12', number: 12, category: 'financial',
            name: 'Audited', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 12,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    expect(screen.getByText(/STAGE 1.*DAY 1-3/i)).toBeInTheDocument();
    expect(screen.getByText(/STAGE 2.*DAY 3-10/i)).toBeInTheDocument();
  });

  it('renders STAGE 4 prefix only above team_hr (not above ip_technical or operations_risk)', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-32', number: 32, category: 'team_hr',
            name: 'Org', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 32,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-39', number: 39, category: 'ip_technical',
            name: 'Trademarks', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 39,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-47', number: 47, category: 'operations_risk',
            name: 'Insurance', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 47,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const stage4Prefixes = screen.queryAllByText(/STAGE 4.*DAY 15-21/i);
    expect(stage4Prefixes).toHaveLength(1);
  });

  it('marks the FIRST section of each stage with data-stage-first="true"', () => {
    const { container } = render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-32', number: 32, category: 'team_hr',
            name: 'Org', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 32,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-39', number: 39, category: 'ip_technical',
            name: 'Trademarks', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 39,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const stage4First = container.querySelector('[data-stage="4"][data-stage-first="true"]');
    expect(stage4First).not.toBeNull();

    const stage4Continuation = container.querySelector('[data-stage="4"][data-stage-first="false"]');
    expect(stage4Continuation).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failures**

```bash
cd cis-deal-room && npx vitest run src/test/components/PlaybookChecklistView.test.tsx
```

Expected: 3 new tests fail.

- [ ] **Step 3: Use ui-ux-pro-max for the stage-prefix visual treatment**

Invoke `ui-ux-pro-max` with this brief:

> Add a small uppercase mono-style stage-prefix label above the FIRST category section header in each stage of the playbook checklist. Format: `STAGE 4 · DAY 15-21` rendered subtly above the existing category name (e.g. "Team & HR"). The category name itself stays as-is in size/weight. The stage prefix is a meta-label — smaller, dimmer, mono — not a competing heading. Categories that continue an already-introduced stage (e.g. "IP & Technical" beneath "Team & HR") get NO stage prefix; just the category name. Spacing between consecutive same-stage categories should be tighter than between stages.
>
> Constraints:
> - Dark + accent design language; existing tokens.
> - File: `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`.
> - Each section header div must include `data-stage="N"` and `data-stage-first="true|false"` for the drill-down query selector.

Apply the visual decisions when writing the code in Step 4.

- [ ] **Step 4: Implement the stage-prefix logic**

In `cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx`, add at the top:

```ts
import { CATEGORY_TO_STAGE, STAGE_META } from '@/lib/dal/playbook';
import type { Stage } from '@/types';
```

Find the rendering loop where `CATEGORY_ORDER.map((cat) => …)` produces a `<CategorySection ... />` for each. Modify the loop to compute, for each category, whether it's the first in its stage:

```tsx
{CATEGORY_ORDER.map((cat, idx) => {
  const items = canonical.filter((c) => c.category === cat);
  const customItems = custom.filter((c) => c.category === cat);
  items.sort((a, b) => {
    if (!!a.dealKillerGroup !== !!b.dealKillerGroup) {
      return a.dealKillerGroup ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });

  const stage = CATEGORY_TO_STAGE[cat];
  const prevCat = idx > 0 ? CATEGORY_ORDER[idx - 1] : null;
  const isFirstInStage = !prevCat || CATEGORY_TO_STAGE[prevCat] !== stage;

  return (
    <CategorySection
      key={cat}
      label={CATEGORY_LABEL[cat]}
      stage={stage}
      isFirstInStage={isFirstInStage}
      items={items}
      customItems={customItems}
      isAdmin={isAdmin}
      workspaceId={workspaceId}
      onChanged={onChanged}
      onUploadForItem={onUploadForItem}
    />
  );
})}
```

Update `CategorySectionProps` to include the new fields:

```tsx
interface CategorySectionProps {
  label: string;
  stage: Stage;
  isFirstInStage: boolean;
  items: CanonicalRow[];
  customItems: CustomRow[];
  isAdmin: boolean;
  workspaceId: string;
  onChanged: () => void;
  onUploadForItem: (itemId: string, name: string) => void;
}
```

Update the `CategorySection` component's section header to include the stage prefix and data attributes (apply ui-ux-pro-max's typography choices for the actual classes):

```tsx
function CategorySection({
  label,
  stage,
  isFirstInStage,
  items,
  customItems,
  isAdmin,
  workspaceId,
  onChanged,
  onUploadForItem,
}: CategorySectionProps) {
  const meta = STAGE_META[stage];
  return (
    <section
      className={clsx('mb-8', !isFirstInStage && 'mt-2')}
      data-stage={stage}
      data-stage-first={isFirstInStage ? 'true' : 'false'}
    >
      {isFirstInStage && (
        <div className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-1">
          Stage {stage} · {meta.dayRange}
        </div>
      )}
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        {label}
      </h3>
      {/* … rest of section body unchanged … */}
    </section>
  );
}
```

(Apply ui-ux-pro-max-derived classes for the stage-prefix typography, weight, spacing rhythm, and the section-margin tightening between same-stage categories. The above is structural — refine visually before committing.)

- [ ] **Step 5: Run tests + tsc**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: all tests pass — including the 3 new ones and the existing PlaybookChecklistView tests.

- [ ] **Step 6: Commit**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git add cis-deal-room/src/components/workspace/PlaybookChecklistView.tsx \
        cis-deal-room/src/test/components/PlaybookChecklistView.test.tsx
git commit -m "feat(stage-timeline): stage prefix headers + data-stage attributes for drill-down"
```

---

## Phase 4: Verification + PR

### Task 7: Manual E2E and PR

**No code changes — verification + ship.**

- [ ] **Step 1: Final test + tsc check**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: clean. All tests pass.

- [ ] **Step 2: Run dev server and walk the feature**

```bash
cd cis-deal-room && npm run dev
```

Open a workspace as admin/seller-side viewer. Verify:

- DealOverview shows 4 stage rows (Stage 1 · Cap & Corp · Day 1-3, etc.) replacing the prior 6 category bars
- Stage 4 row reads "Legal · IP · HR · Ops" with day range "Day 15-21" and total = 17
- Headline still shows "X / 48 (Y%)"
- 5 deal-killer chips above the stage rows still render
- Click each stage row → checklist tab opens, scrolls to the right section, briefly outlines it
- On the checklist tab, each stage's first category has the "STAGE N · DAY N-N" prefix above the category name
- Stage 4's three categories (Team & HR, IP & Technical, Operations & Risk) only show the prefix above Team & HR; the other two render with just the category name and slightly tighter top margin
- Existing deal-killer chip click still works (regression check)
- Mark item #14 (Detailed revenue schedule) as Received → Stage 2 progress bar moves; Stage 4 unaffected
- Mark item #34 (Contractor agreements) as Received → Stage 4 progress bar moves; Stages 1-3 unaffected

- [ ] **Step 3: Push + PR**

```bash
cd "/Users/robertlevin/development/Deal Rooms"
git push -u origin feat/stage-timeline

gh pr create --title "feat(stage-timeline): per-stage readiness panel + checklist stage labels" --body "$(cat <<'EOF'
## Summary

Reframes the readiness panel from per-category to per-stage, mirroring how investors actually traverse the playbook (Day 1-3 → Day 15-21 across 4 stages). Stages are independent — each tracks its own progress because diligence info typically arrives in parallel from different parties.

- **API**: `GET /readiness` adds a `byStage` field alongside `byCategory`. No new endpoints. No schema change.
- **DAL**: `Stage` type, `CATEGORY_TO_STAGE` mapping, and `STAGE_META` constants exported from `lib/dal/playbook.ts`. `getReadinessSummary` aggregates by stage in one pass.
- **ReadinessPanel**: 4 per-stage rows replace the prior 6 per-category bars. Each row clickable; click drills into checklist tab and scrolls to that stage's first category section with a brief outline pulse (reuses the chip-deep-link mechanism from PR #13, generalized to a `PendingHighlight` discriminated union).
- **PlaybookChecklistView**: each stage's first category section gets a `STAGE N · DAY N-N` prefix label. Continuation categories within the same stage render with just the category name and tighter top margin.
- **Stage 5** (disclosure schedule) deferred. It's a deliverable, not item-driven; future cycle.

UI work was designed using the \`ui-ux-pro-max\` skill within the existing dark + brand-red language documented in \`.impeccable.md\` and \`design-system/cis-deal-room/MASTER.md\`.

## Test plan

- [ ] DealOverview shows 4 stage rows with correct labels + day ranges + totals (11/11/9/17)
- [ ] Headline still shows X / 48 (Y%); 5 deal-killer chips unchanged
- [ ] Click each stage row → checklist opens, scrolls to right section, brief pulse
- [ ] Existing deal-killer chip click still works (regression)
- [ ] Checklist tab shows STAGE prefix only above first category in each stage; Stage 4's three categories share one prefix
- [ ] Mark items in different stages → correct stage bar moves, others unaffected
- [ ] Mobile/narrow viewport renders cleanly (rows stack or truncate gracefully)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Done**

PR created. Auto-deploys to a preview URL. After review/merge, production gets the per-stage readiness view.

---

## Self-Review Notes

- **Spec coverage:**
  - §3 stage definitions → Task 1 (constants)
  - §4 architecture / data model / API → Tasks 1 + 2 + 3
  - §5 ReadinessPanel + drill-down → Tasks 4 + 5
  - §5 checklist tab stage labels → Task 6
  - §6 data flow → Tasks 4 + 5 + 6 (the chain works end-to-end)
  - §7 backwards compat → preserved (byCategory still in API; no schema change)
  - §8 testing → tests defined per task
  - ui-ux-pro-max requirement → called out in Tasks 5 and 6 with explicit briefs
- **Placeholder scan:** No "TBD" / "TODO" / "fill in later" / "add appropriate". Every step has concrete code or commands.
- **Type consistency:** `Stage`, `PendingHighlight`, `ReadinessSummary` defined in Task 1, used identically across Tasks 2-6. The `highlightTarget` prop name is consistent across `WorkspaceShell` → `ChecklistView` → `PlaybookChecklistView`. The `onStageClick` signature is the same in the test (Task 5 Step 1) and the implementation (Task 5 Step 4).
- **Open spec questions resolved:**
  - Mobile rendering → addressed in Task 5 Step 3 brief (truncate Stage 4 long label, vertical stacking optional)
  - Empty `/readiness` byStage → addressed in Task 3

---

**Plan complete.**
