# Handoff: Deal Room — Q&A & Workstreams

## Overview
This package specifies two **new modules being added to the existing CIS Deal Room app**:

1. **Q&A** — a vetted, due-diligence question workflow. Buyers/sellers ask questions, an assignee proposes an answer, and (on sell-side engagements) CIS must approve the answer before it is released to the asker.
2. **Workstreams** — a cross-cutting tagging + access layer (Legal, Finance, Technology, HR, Commercial) that re-lenses the whole workspace and grants membership-based access.

> ⚠️ **This is an extension of an existing product, not a greenfield app.** The screens here must be implemented inside the current Deal Room codebase, reusing its existing shell, navigation, tables, badges, access model, and notification pipeline. Do **not** build a parallel app or a new design language. The bottom of the prototype ("Build on existing patterns") names the specific existing modules to extend — follow them. Where this doc and the existing codebase conventions differ on naming/structure, **the codebase wins**; match it.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look, layout, and behavior. They are **not production code to copy directly**. The HTML uses a custom rendering runtime (`support.js`, `<x-dc>` tags) that is irrelevant to the target app — ignore it.

Your task is to **recreate these designs inside the existing Deal Room codebase**, using its established framework, component library, and patterns (the prototype's own dev notes indicate a React/TypeScript app with components like `ChecklistTable`, `Badge`, `WorkspaceShell`). Reuse existing primitives wherever they exist rather than introducing new ones.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interaction intent are all specified. Recreate the UI faithfully using the codebase's existing components and tokens. Exact hex/spacing values are given below for cases where a matching token doesn't already exist — but **prefer the app's existing design tokens** over re-introducing literals.

---

## Existing-app integration (READ FIRST)
These notes come directly from the design and define how the new modules graft onto current code. Treat them as requirements:

| Area | Build on existing pattern |
|---|---|
| **Q&A list table** | Model the table and its multi-filters on **`ChecklistTable`** (useMemo-derived rows + `Set`-based filter state). Reuse **`Badge`** / **`ChecklistStatusChip`** for the status pills rather than new chip components. |
| **Access & navigation** | Add a **workstream-membership access path to `access.ts`**, layered as a **union** with the existing folder-access rules (membership grants access *in addition to* folder permissions; it never revokes). Add two new **`CenterView`** kinds — **`qna`** and **`workstream`** — to **`WorkspaceShell`**. |
| **Events / notifications** | Slot Q&A notifications into **`enqueueOrSend`** so they respect each user's immediate/digest preference. Add the new action enums to **`logActivity`**. |
| **Rich text** | The composer/answer editor is **light formatting + @mention only** — reuse the existing editor in that reduced configuration; do not add a full WYSIWYG. |

Consistency requirements for the rest of the app:
- The **left sidebar, project switcher, top breadcrumb bar, avatars, and global "Ask" affordance** in these mocks are the *existing* Deal Room shell. Render the new center views inside the real shell; don't reimplement chrome.
- **Workstreams** is **orthogonal to folders**: an item keeps its single folder home and can carry many workstream tags. Selecting a workstream re-lenses the existing workspace (filters docs, activity, and Q&A to that tag) — it is a lens over existing surfaces, not a separate data silo.
- Approval routing is **derived from the engagement side** (`cisAdvisorySide`), not configured per question. Sell-side ⇒ the seller designee's answer is gated by CIS before release. Don't add per-question approval toggles.

---

## Screens / Views

### 1. Q&A — question list  (`CenterView` kind: `qna`)
**Purpose.** Browse/filter every due-diligence question across all workstreams; triage by status, workstream, assignee, and overdue.

**Layout.** Full workspace: existing left **sidebar 248px** + main column (flex:1). The sidebar gains a **"Workstreams"** section listing the 5 workstreams with a color dot, name, and item count, plus a "Manage" link.
Main column = a header row (title + "Ask a question" CTA), a filter bar, then the questions table.

**Questions table.** A single bordered card (`#FFFFFF`, 1px `#CBCAC7`, radius 8px). CSS grid, 6 columns:
`grid-template-columns: 130px 1fr 150px 150px 96px 110px;`
Columns: **Status · Question · Workstream · Assignee · Asked · Requested**.
- Header row: `#FAFAF9`/`#0E0E0E`-equivalent tint, 11px/600 uppercase `#6B6B6B`, letter-spacing 0.1em, bottom hairline `#CBCAC7`.
- Body rows: padding `13px 20px`, bottom divider `#F2F2F1`/`#E8E8E6`, font-size 14px. **Overdue rows** carry a faint red wash (`#FDFAFA`).
- **Question cell** may include a sub-line (e.g. a linked-doc note in 12px `#9A9A9A`) and inline badges (e.g. a **Private** lock pill).
- **Workstream cell**: 8px color dot + label; a question may show **multiple** workstream dots.
- **Assignee cell**: 22px avatar (initials) + name, or a dashed-ring "Unassigned" state in `#9A9A9A`.
- **Asked / Requested cells**: `DM Mono` 13px `#6B6B6B`. An overdue **Requested** date is red (`#C8281F`) with a small clock icon.

**Filter bar.** Pill buttons: **Status** (multi-select, shows a count badge), **Workstream**, **Assignee** (each a dropdown), and an **"Overdue only"** toggle styled as a red-outline chip (`#C8281F` text, `#FBE5E4` bg, `#F3C9C7` border). Right-aligned result count in `DM Mono` (`8 of 31`).

**Header.** H3 "Q&A" (28px/500); subline "Due-diligence questions across all workstreams · **8 open** · **2 overdue** (red) · 23 approved". Primary CTA **"Ask a question"** — red `#E10600`, white text, radius 6px, plus-icon.

---

### 2. Q&A detail — thread + official answer
**Purpose.** Read the clarification thread, see the proposed official answer, and (CIS view) approve/reject it.

**Layout.** Bordered card with a 58px topbar (breadcrumb `Q&A › Q-118 › title` + a status pill), then a **two-column grid**: `grid-template-columns: 1fr 392px;`.
- **Left (thread).** Question title (22px/500), a metadata row (workstream dot, **Public/Private** pill, linked-doc chip, "Requested by" date), a "Conversation" eyebrow, then chronological messages. Each message = 34px avatar + name + role pill (Buyer / Seller·Finance) + `DM Mono` timestamp + body (14px/1.6). The **proposed answer** is a bordered sub-card flagged "Proposed answer — submitted for CIS approval" with an attached-file chip. Below: a **composer** (light-formatting toolbar: bold/italic/list/link/mention, "Attach from a folder", placeholder, "Post reply" black button).
- **Right (official answer + meta).** An **approval gate** card at top, then a "Details" list (Status, Assignee, Workstream, Visibility, Asked, Requested by, Linked doc), then a help note.

**Approval gate** (neutralized graphite, *not* a colored alert):
- Card border `#D8D6CE`, radius 8px. Header strip bg `#F1F0EB`, bottom border `#E2E0D9`, label "Approval required — CIS gate" in `#6E6A62` with a layers icon.
- Body: explanatory line, then **"Approve & release to asker"** (black `#0A0A0A`, white text, check icon), and a row of two secondary buttons **"Request changes"** / **"Reroute"** (white, 1px `#CBCAC7`).

---

### 3. Workstream overview (dashboard)  (`CenterView` kind: `workstream`)
**Purpose.** When a workstream is selected, the workspace re-lenses to it and opens this dashboard.

**Layout.** Topbar shows breadcrumb `Workstreams › [dot] Legal` and a **"Clear lens"** control. Body (`#F5F5F4`) contains:
- **Header:** a 48px rounded icon tile (neutral tint `#ECEBE6`, 1px `#D8D6CE`) + workstream name (30px/500) + description; right side = stacked member avatars (+overflow count) and "Manage members".
- **Stat cards:** `grid-template-columns: repeat(4,1fr); gap:16px;` — Documents, Open Q&A, **Overdue** (red-accented card: border `#F3C9C7`, number + label in `#C8281F`), Members. Each: 11px eyebrow, 38px/500 tabular-nums figure, 12px sub-note.
- **Two-column:** `1fr 392px`. Left = "Recent activity" feed (30px circular icon chips + actor/action/timestamp). Right = quick-link cards (Documents, Q&A) + an "Open questions" mini-list of status-pill + title rows.

---

### 4. Ask a question (modal)
**Purpose.** Create a question inside a workstream; set visibility, propose an assignee, optionally link a doc.

**Layout.** Centered modal **640px** over a dimmed/blurred backdrop (`rgba(10,10,10,0.42)` + `blur(2px)`). Card: white, 1px `#CBCAC7`, radius 10px, shadow `0 24px 48px -12px rgba(10,10,10,0.28)`.
- **Header:** "Ask a question" (18px/600) + close (×).
- **Body fields** (stacked, 18px gap), each with a 12px/600 `#2B2B2B` label:
  - **Workstream** — select showing dot + name.
  - **Question** — textarea (min-height ~74px).
  - **Visibility** — a 2-segment toggle **Public / Private** (active segment = black `#0A0A0A`, white text). Selecting **Private** reveals a **recipient picker** (chips of selected members + "Add member…").
  - Two-up grid: **Proposed assignee** (avatar + name select, helper "CIS confirms or reroutes") and **Response requested by** (date, `DM Mono`, helper "Optional · flags overdue if missed").
  - **Link a document — optional** — dashed dropzone "Select an existing file from a folder".
- **Footer:** left helper "Visible only to selected recipients" (lock icon); right **Cancel** (white) + **Submit question** (red `#E10600`).

---

### 5. Reference panels (documentation, not a screen)
The prototype's last section documents the **workstream system** (5 tags, descriptions, color values) and the **Q&A status lifecycle**. Use it as the source of truth for enums and seed data. No UI to build from it.

---

## Interactions & Behavior
- **Filters** (Q&A list): Status is multi-select with a count badge; Workstream & Assignee are single/multi dropdowns; **Overdue only** is a boolean toggle. Implement as `Set`-based state per the existing `ChecklistTable` pattern; rows derived via `useMemo`.
- **Status lifecycle:** `New → Assigned → Answered → Approved`. **Overdue** is a *derived* flag (has a `requestedBy` date in the past and is not yet Approved), shown as an overlay treatment — it is filterable but is not a stored status value.
- **Approval gate:** visible only when the engagement is sell-side (`cisAdvisorySide`) and the question is `Answered`. Approve → status `Approved`, answer pinned to top of the thread, asker notified per delivery preference. Request changes → back to assignee. Reroute → reassign.
- **Visibility:** Public = all workstream members; Private = explicit recipient list (picker). Persist recipients on the question.
- **Re-lensing:** selecting a workstream (sidebar or breadcrumb) scopes docs/activity/Q&A to that tag and opens the dashboard; "Clear lens" returns to the unlensed workspace.
- **Hover/press** (match existing app): links black→`#E10600`; black buttons brighten to `#1A1A1A`; red buttons darken to `#B80500`; cards darken hairline + step shadow `xs→sm`, **no lift/translate**. Press = 1–2px translateY down, no scale.
- **Motion:** single easing `cubic-bezier(0.32, 0.72, 0, 1)`, ~220ms. Only opacity fades and 8–16px upward slides on scroll-in. **No** counter-up on numbers (render the figure), no bounces/springs/parallax.

## State Management
- **Question:** `id`, `title`, `status` (`new|assigned|answered|approved`), `workstreamTags: string[]` (many), `assignee | null`, `askedAt`, `requestedBy | null`, `visibility` (`public|private`) + `recipients[]`, `linkedDocId | null`, `thread: Message[]`, `proposedAnswer | null` (+ attachments), `approval` (derived from `cisAdvisorySide`).
- **Derived:** `isOverdue = requestedBy != null && requestedBy < now && status !== 'approved'`.
- **Workstream:** `id`, `name`, `color`, `description`, `members[]`, `docCount`, `openQaCount`, `overdueCount`.
- **Access:** workstream membership ⇒ access union with folder access (additive). Wire into `access.ts`.
- **Data fetching:** reuse the app's existing query/data layer; these are new entity types + two new center views, not a new backend client.

## Design Tokens
The design follows the **CIS Partners design system** — a black-and-paper system where **red (`#E10600`) is reserved for one element per view** (here: overdue + primary CTA). The categorical workstream colors were deliberately set to a **monochrome warm-grey ramp** (the client chose this over colored accents). Full token file bundled as **`colors_and_type.css`** (use the app's equivalents first).

**Surfaces & ink**
| Token | Hex |
|---|---|
| White surface (panels) | `#FFFFFF` |
| Near-white panel bg | `#F5F5F4` |
| Hairline border | `#CBCAC7` |
| Soft border / divider | `#E8E8E6` |
| Row divider | `#F2F2F1` |
| Ink primary | `#0A0A0A` |
| Ink 700 / 500 / 400 / 300 | `#2B2B2B` · `#4A4A4A` · `#6B6B6B` · `#9A9A9A` |
| Avatar bg (light / solid) | `#E8E8E6` · `#2B2B2B` |

**Brand / action**
| Token | Hex |
|---|---|
| CIS red (CTA, overdue) | `#E10600` (hover `#B80500`) |
| Black button | `#0A0A0A` (hover `#1A1A1A`) |
| Overdue red text | `#C8281F` · bg `#FBE5E4` · border `#F3C9C7` |

**Workstream ramp (monochrome — dot / label / icon stroke)**
| Workstream | Color | Icon tile tint |
|---|---|---|
| Legal | `#33322F` | `#ECEBE6` |
| Finance | `#5C5A54` | `#EAE9E4` |
| Technology | `#84827A` | `#ECEBE6` |
| HR | `#A8A69E` | `#EFEDE7` |
| Commercial | `#C7C5BD` | `#EAE9E4` |

**Q&A status chips** (12px/600, pill radius)
| Status | Bg | Text |
|---|---|---|
| New | `#EFEFEC` | `#7A7872` |
| Assigned | `#DAD8D2` | `#3E3C37` |
| Answered | `#C3C0B8` | `#2E2C27` |
| Approved | `#2B2A27` | `#FFFFFF` (check icon) |
| Overdue (flag) | `#FBE5E4` | `#C8281F` (clock icon) |

**Other chips**
| Chip | Bg | Text |
|---|---|---|
| Public | `#EAE9E4` | `#5C5A54` (globe) |
| Private | `#EBEBEA` | `#4A4A4A` (lock) |
| Approval gate header | `#F1F0EB` (border `#D8D6CE` / `#E2E0D9`) | `#6E6A62` |

**Typography** — Primary **Whitney SSm** (Book) with **DM Sans** fallback for heavier weights; **DM Mono** for all figures, IDs, dates, deal numbers (`font-variant-numeric: tabular-nums`).
| Role | Size / weight / tracking |
|---|---|
| Section H2 | 26px / 500 / -0.012em |
| Screen H3 | 28–30px / 500 / -0.015em |
| Detail title | 22px / 500 / -0.01em |
| Body | 14px / 400 / line-height 1.6 |
| Eyebrow / label | 11–12px / 600 / UPPERCASE / 0.12–0.18em / `#9A9A9A` |
| Table header | 11px / 600 / UPPERCASE / 0.1em / `#6B6B6B` |
| Chip | 12px / 600 |
| Mono (figures/dates) | DM Mono 12–13px |

**Spacing** — 4px base; 8 / 16 / 24 / 48 carry layout. Card padding 20–24px; section gaps 16–28px.
**Radius** — cards 8px · buttons & inputs 6px · icon tiles 7–10px · chips/pills 999px (full). No 16–24px "friendly" radii.
**Shadows** — resting `0 1px 2px rgba(10,10,10,0.04)`; hover `0 2px 6px rgba(10,10,10,0.06)`; modal `0 24px 48px -12px rgba(10,10,10,0.28)`. No inner shadows on inputs (use 1px border).

## Assets
- `assets/logo-black.png` — CIS wordmark (sidebar + cover). Use the app's existing logo asset if present.
- Icons: **Lucide** line icons, 1.5px stroke, `currentColor` (the prototype inlines equivalents). Use the app's existing icon set if it already ships one.
- Avatars are initials on a neutral fill — no image assets required.
- No photography.

## Files
| File | What it is |
|---|---|
| `Deal Room - QA & Workstreams (White).dc.html` | The hifi prototype — open in a browser to inspect every screen (Q&A list, Q&A detail, Workstream dashboard, Ask modal, plus the system-reference panels). Source of exact markup/spacing. |
| `colors_and_type.css` | CIS design-system tokens (colors, type, spacing, motion, shadows) for cross-reference. |
| `assets/logo-black.png` | Wordmark used in the design. |
| `screenshots/01-screen.png` … `05-screen.png` | Reference renders: 01 Q&A list · 02 Q&A detail · 03 Workstream dashboard · 04 Ask-a-question modal · 05 Reference panels. |

> The `.dc.html` file references a `support.js` runtime that is **not** included and **not** relevant — it's only the prototyping harness. Read the file for layout/markup; ignore the `<x-dc>` / `support.js` plumbing.
