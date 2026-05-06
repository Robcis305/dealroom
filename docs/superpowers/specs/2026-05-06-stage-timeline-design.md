# Design: Stage Timeline (CIS Deal Room v1.4)

**Date:** 2026-05-06
**Status:** Approved (brainstorm), pending implementation plan

## 1. Overview

Reframe the readiness panel from per-category to per-stage. Each playbook item belongs to one of 4 stages mapped from the playbook PDF's "How a partner moves through your data room" section. Stages are **independent** — each tracks its own progress because diligence info typically arrives in parallel from different parties. Clicking a stage bar drills into the checklist tab, scrolled and highlighted to the relevant section. Stage 5 (disclosure schedule) is deferred — it's a deliverable produced from items in stages 1-4, not item-driven, and merits its own future cycle.

The reframe: investors traverse stages 1-4 in canonical order. The seller's job is to be ready for whichever stage(s) they're entering — not to hit a single overall percentage.

## 2. Scope

### In scope (v1.4)

- Stage as the dominant metric in DealOverview's readiness panel
- 4 stage progress bars replacing the 6 per-category bars
- Click a stage → navigate to checklist tab, scroll + briefly outline the relevant section
- Stage labels on category section headers in the checklist tab
- `byStage` aggregation added to the readiness API response
- Same role visibility gating as v1.3 (admin / cis_team / seller_rep / seller_counsel / client-on-seller-side)

### Out of scope (deferred)

- Stage 5 / disclosure-schedule workflow (separate feature)
- Per-stage friction gating (we explicitly chose to NOT layer more gates on top of deal-killers)
- Item-level stage override (stages are derived from category; no per-item flexibility for v1)
- Stage filter chip on the checklist tab (auto-scroll + highlight is enough)
- User-editable day windows (canonical from the playbook)
- Cross-deal stage analytics

## 3. Stage definitions

Static mapping from category → stage. The day windows come verbatim from the playbook PDF.

| Stage | Window | Categories | Item count |
|---|---|---|---|
| 1 — Cap & Corp | Day 1-3 | `corporate_legal` | 11 |
| 2 — Financial | Day 3-10 | `financial` | 11 |
| 3 — Commercial | Day 10-15 | `commercial` | 9 |
| 4 — Legal · IP · HR · Ops | Day 15-21 | `team_hr`, `ip_technical`, `operations_risk` | 17 |

Total: 48. Stage 5 (Day 21-28, "disclosure schedule") deferred.

## 4. Architecture

### Data model

No schema change. The mapping lives as a `const` exported from `cis-deal-room/src/lib/dal/playbook.ts`:

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

### Readiness summary extension

`getReadinessSummary` extends its return type to include a `byStage` field alongside the existing `byCategory`. The existing fields stay because the checklist tab still groups by category.

```ts
export interface ReadinessSummary {
  total: number;
  ready: number;
  byCategory: Record<PlaybookCategory, { total: number; ready: number }>;
  byStage: Record<Stage, { total: number; ready: number; label: string; dayRange: string }>;
  // Existing field, unchanged from v1.3 — keeps the same per-member shape.
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    status: ChecklistStatus;
    color: DealKillerGroupStatus;
    members: Array<{ playbookItemId: string; number: number; status: ChecklistStatus }>;
  }>;
}
```

`byStage` is computed from `byCategory` via `CATEGORY_TO_STAGE` — no extra DB query.

### API

`GET /api/workspaces/[id]/readiness` returns the extended shape. No new endpoints. Same auth gating as v1.3.

The empty-state response (no checklist row exists yet — auto-created in v1.3 for playbook-eligible viewers) gets a populated `byStage` with all-zero stages so the UI renders correctly.

## 5. Components

> **Implementation note:** All UI work in this section (ReadinessPanel restructure, stage prefix on checklist section headers, drill-down pulse) MUST be designed using the **`ui-ux-pro-max`** skill — invoke it before writing component code or final Tailwind classes. The shapes and labels described below are the spec contract; the visual treatment (typography weight, spacing rhythm, transition curves, focus states, empty/zero states, mobile breakpoint behavior) is decided by ui-ux-pro-max within the existing dark + brand-red design language defined in `.impeccable.md` and `design-system/cis-deal-room/MASTER.md`.



### ReadinessPanel — restructured

Replace the 6 per-category bars with 4 per-stage bars. Headline ("12 / 48 (25%)") and 5 deal-killer chips above stay unchanged.

Each stage row:
- Stage label ("Stage 1 · Cap & Corp")
- Day range ("Day 1-3")
- Progress bar (filled by `ready / total`)
- Count ("5 / 11")
- Entire row is a clickable button

Stage at 100% renders bar in `bg-emerald-700/60` (current "ready" green). Otherwise default progress treatment. No "current stage" indicator — independent stages mean the concept doesn't apply.

### Drill-down behavior

Generalize the existing `pendingHighlight` state in `WorkspaceShell` (introduced in PR #13) to support multiple highlight kinds:

```ts
type PendingHighlight =
  | { kind: 'deal_killer'; group: DealKillerGroup }
  | { kind: 'stage'; stage: Stage };
```

The existing chip → scroll → outline pulse mechanism is reused. `PlaybookChecklistView`'s `useEffect` is generalized:

- `kind: 'deal_killer'` → existing behavior, scroll to `[data-deal-killer-group="…"]`
- `kind: 'stage'` → scroll to `[data-stage="N"]` (the first category section header in that stage)

Each category section header in the playbook view gains a `data-stage` attribute. The outline pulse uses the same Tailwind ring classes.

### Checklist tab — stage labels on section headers

Each category section in `PlaybookChecklistView` gets a stage prefix above the category name. When consecutive categories share a stage (Stage 4's three categories), only the first shows the stage prefix; the subsequent ones omit it (they continue the same stage visually).

Layout:

```
STAGE 1 · DAY 1-3
Corporate & Legal
[items 1-11 …]

STAGE 2 · DAY 3-10
Financial
[items 12-22 …]

STAGE 3 · DAY 10-15
Commercial & Customer
[items 23-31 …]

STAGE 4 · DAY 15-21
Team & HR
[items 32-38 …]

IP & Technical
[items 39-46 …]

Operations & Risk
[items 47-48 …]
```

Implementation: each section header div carries `data-stage="N"` and `data-stage-first="true"` (or false). Only `data-stage-first="true"` headers render the stage prefix.

## 6. Data flow

1. DealOverview mounts → fetches `/readiness` → response includes `byStage`
2. ReadinessPanel renders 4 stage bars from `byStage`
3. User clicks Stage 2 bar → `onChipClick`-equivalent handler fires `setView({ kind: 'checklist' })` and `setPendingHighlight({ kind: 'stage', stage: 2 })`
4. PlaybookChecklistView mounts (or re-renders), its `useEffect` reads `highlightTarget`, finds `[data-stage="2"][data-stage-first="true"]`, scrolls into view, applies ring classes for 2 seconds, calls `onHighlightConsumed` to clear

## 7. Migration / backwards compatibility

- No DB schema changes
- API response shape extends additively (`byStage` is new; `byCategory` retained); no client breakage
- Old chip deep-link (deal-killer) continues to work — it's now one of two highlight kinds
- The 6-bar per-category UI in `ReadinessPanel` is replaced; existing `byCategory` data is unused by the panel but kept on the API for potential future use (e.g., the deferred per-stage drill-down side panel)

## 8. Testing approach

- Unit: `getReadinessSummary.byStage` aggregates correctly including Stage 4's multi-category roll-up
- Unit: stage at 100% renders green; partial renders default
- Unit: `CATEGORY_TO_STAGE` mapping covers all 6 canonical categories with no gaps
- Component: ReadinessPanel renders 4 stage rows with correct label/day-range/count for a sample summary
- Component: clicking a stage row invokes the supplied click handler with the right stage number
- Component: PlaybookChecklistView renders `STAGE N · DAY N-N` prefix only above the FIRST category in each stage (not on continuation categories)
- E2E manual: click each of the 4 stage bars → checklist tab opens, scrolled to the right section, brief pulse visible
- E2E manual: existing deal-killer chip click still works (regression check)

## 9. Open questions

None at design time. Two minor items the implementation plan should resolve:

- **Mobile/narrow-viewport rendering** — the stage bars get long when stacked horizontally on small screens. Implementer decides between vertical stack (most compatible) or text truncation. Either is acceptable; existing readiness panel patterns apply.
- **Empty `byStage` shape on no-checklist response** — confirm the `/readiness` route's empty response (when no checklist row exists for the workspace) populates `byStage` with all-zero stages plus their `label`/`dayRange` metadata, so the panel renders correctly even on a fresh workspace.
