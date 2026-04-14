# Phase 3.5 — Visual Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the app from its current placeholder dark theme to the final CIS Partners light-theme brand: pure-white surfaces, near-black text, red (`#E10600`) used sparingly for CTAs and emphasis, and the real CIS Partners logo everywhere. Bundle three Phase-3 UX fixes (workspace navigation, UploadModal folder-selector, UploadModal queue reset) into the same pass since they touch the same files.

**Architecture:** Introduce a semantic design-token layer in `globals.css` (`--color-surface`, `--color-text-primary`, `--color-accent`, etc.), exposed via `@theme` so Tailwind generates `bg-surface`, `text-primary`, `border-default`-style utility classes. Every component migrates off its hardcoded `bg-[#141414]`, `text-white` hex references onto the semantic classes. Once the migration is complete, the palette flip is a single-file change — swapping token values for any future dark-mode toggle or brand tweak costs almost nothing.

A new `<Logo />` component encapsulates the CIS Partners SVG with size variants and replaces the red-square placeholder in LoginPage, VerifyPage, WorkspaceShell header, and the three email templates.

The three UX fixes are folded into the migration tasks that touch their respective files.

**Tech Stack:** Tailwind v4 `@theme` · Next.js 15 App Router · TypeScript · React Email (for email templates) · Vitest (no visual regression tooling — verification is manual via the human-verify checkpoint)

---

## Scope boundaries

**In scope:**
- Semantic design tokens (add, wire into @theme)
- Migrate every component with hardcoded hex colors in `className` props
- Logo component + integration at all surfaces (including emails)
- Phase-3 UX fixes #1, #2a, #2b (bundled where they already touch a migrating file)

**Out of scope (deferred or their own phase):**
- Dark-mode toggle (tokens will make it trivial later; not building the toggle)
- Responsive layout changes (Phase 4 — UI-06)
- Downloads needing real S3 / local-fs fallback (Item 3b — separate decision)
- Typography changes (keep DM Sans + JetBrains Mono)
- Tests for visual appearance (manual verification only)

---

## Palette reference

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#FFFFFF` | page background |
| `--color-surface` | `#FFFFFF` | cards, modals, panels |
| `--color-surface-elevated` | `#FAFAFA` | subtle elevation (hover, sidebar) |
| `--color-surface-sunken` | `#F4F4F5` | inputs, form fields |
| `--color-border` | `#E4E4E7` | default border |
| `--color-border-subtle` | `#F4F4F5` | dividers, row separators |
| `--color-text-primary` | `#0D0D0D` | headings, body text |
| `--color-text-secondary` | `#52525B` | labels, metadata |
| `--color-text-muted` | `#A1A1AA` | timestamps, hints, placeholder |
| `--color-accent` | `#E10600` | primary CTAs, brand accent, active state |
| `--color-accent-hover` | `#C40500` | CTA hover |
| `--color-accent-subtle` | `#FEE2E2` | red tints (selected rows, destructive backgrounds) |
| `--color-success` | `#16A34A` | Active participant status |
| `--color-success-subtle` | `#DCFCE7` | success badge bg |
| `--color-warning` | `#CA8A04` | duplicate file warnings |
| `--color-danger` | `#DC2626` | errors, destructive actions |
| `--color-danger-hover` | `#B91C1C` | destructive-action hover |

Current dark-theme hex values and their replacements are listed per-task below.

---

## File Map

| Action | Path |
|---|---|
| Modify | `cis-deal-room/src/app/globals.css` |
| Create | `cis-deal-room/src/components/ui/Logo.tsx` |
| Modify | `cis-deal-room/src/components/ui/Modal.tsx` |
| Modify | `cis-deal-room/src/components/ui/Button.tsx` |
| Modify | `cis-deal-room/src/components/ui/Input.tsx` |
| Modify | `cis-deal-room/src/components/ui/Badge.tsx` |
| Modify | `cis-deal-room/src/app/(auth)/login/page.tsx` and its form components |
| Modify | `cis-deal-room/src/app/auth/verify/page.tsx` |
| Modify | `cis-deal-room/src/app/(app)/deals/page.tsx` |
| Modify | `cis-deal-room/src/components/deals/DealList.tsx` |
| Modify | `cis-deal-room/src/components/deals/NewDealModal.tsx` |
| Modify | `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` |
| Modify | `cis-deal-room/src/components/workspace/FolderSidebar.tsx` |
| Modify | `cis-deal-room/src/components/workspace/FileList.tsx` |
| Modify | `cis-deal-room/src/components/workspace/DealOverview.tsx` |
| Modify | `cis-deal-room/src/components/workspace/RightPanel.tsx` |
| Modify | `cis-deal-room/src/components/workspace/ParticipantList.tsx` |
| Modify | `cis-deal-room/src/components/workspace/ParticipantFormModal.tsx` |
| Modify | `cis-deal-room/src/components/workspace/UploadModal.tsx` |
| Modify | `cis-deal-room/src/lib/email/magic-link.tsx` |
| Modify | `cis-deal-room/src/lib/email/invitation.tsx` |
| Modify | `cis-deal-room/src/lib/email/upload-batch.tsx` |
| Modify | `cis-deal-room/docs/phase-3-checkpoint.md` (add visual-verification steps) |

---

## Task 1: Design tokens in `globals.css`

**Files:**
- Modify: `cis-deal-room/src/app/globals.css`

- [ ] **Step 1: Replace the @theme block with semantic light-theme tokens**

Open `cis-deal-room/src/app/globals.css`. Replace the current `@theme { ... }` block entirely with:

```css
@theme {
  /* ─── Surfaces ─────────────────────────────────────────────────────────── */
  --color-bg:                #FFFFFF;
  --color-surface:           #FFFFFF;
  --color-surface-elevated:  #FAFAFA;
  --color-surface-sunken:    #F4F4F5;

  /* ─── Borders ──────────────────────────────────────────────────────────── */
  --color-border:            #E4E4E7;
  --color-border-subtle:     #F4F4F5;

  /* ─── Text ─────────────────────────────────────────────────────────────── */
  --color-text-primary:      #0D0D0D;
  --color-text-secondary:    #52525B;
  --color-text-muted:        #A1A1AA;
  --color-text-inverse:      #FFFFFF;

  /* ─── Brand accent ─────────────────────────────────────────────────────── */
  --color-accent:            #E10600;
  --color-accent-hover:      #C40500;
  --color-accent-subtle:     #FEE2E2;

  /* ─── Status ───────────────────────────────────────────────────────────── */
  --color-success:           #16A34A;
  --color-success-subtle:    #DCFCE7;
  --color-warning:           #CA8A04;
  --color-warning-subtle:    #FEF9C3;
  --color-danger:            #DC2626;
  --color-danger-hover:      #B91C1C;
  --color-danger-subtle:     #FEE2E2;

  /* ─── Fonts (unchanged — wired via next/font in layout.tsx) ───────────── */
  --font-sans: var(--font-dm-sans);
  --font-mono: var(--font-jetbrains-mono);
}

/* Ensure html/body inherit the bg token so full-viewport surfaces paint correctly */
html, body {
  background-color: var(--color-bg);
  color: var(--color-text-primary);
}
```

Delete any remaining dark-theme-specific CSS rules that don't belong after the flip.

- [ ] **Step 2: Verify next/font variable names still match**

Open `cis-deal-room/src/app/layout.tsx` and confirm DM_Sans and JetBrains_Mono are configured with `variable: '--font-dm-sans'` and `variable: '--font-jetbrains-mono'`. If the existing names differ, keep the globals.css side matching layout.tsx — do not rename layout.tsx in this task.

- [ ] **Step 3: Typecheck + run full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: zero TS errors. All tests still GREEN (no tests check visual colors).

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/app/globals.css && git commit -m "feat(theme): introduce semantic design tokens for light theme"
```

---

## Task 2: `<Logo />` component

**Files:**
- Create: `cis-deal-room/src/components/ui/Logo.tsx`

- [ ] **Step 1: Create the Logo component**

Create `cis-deal-room/src/components/ui/Logo.tsx`:

```typescript
import Image from 'next/image';
import { clsx } from 'clsx';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  size?: LogoSize;
  className?: string;
  /** When true, renders with white fill (for use on dark backgrounds) */
  inverse?: boolean;
}

const SIZE_DIMENSIONS: Record<LogoSize, { w: number; h: number }> = {
  sm: { w: 96, h: 41 },
  md: { w: 144, h: 61 },
  lg: { w: 200, h: 85 },
  xl: { w: 280, h: 119 },
};

/**
 * CIS Partners brand logo, served from /public/cis-partners-logo.svg.
 *
 * Primary use: LoginPage / VerifyPage / WorkspaceShell header /
 * email templates. The SVG has a single color (currently black);
 * pass `inverse` when rendering on a dark background — it flips the
 * fill via CSS filter.
 */
export function Logo({ size = 'md', className, inverse = false }: LogoProps) {
  const { w, h } = SIZE_DIMENSIONS[size];
  return (
    <Image
      src="/cis-partners-logo.svg"
      alt="CIS Partners"
      width={w}
      height={h}
      priority
      className={clsx(
        'select-none',
        inverse && 'invert',
        className
      )}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/components/ui/Logo.tsx && git commit -m "feat(ui): add Logo component with size variants and inverse mode"
```

---

## Task 3: Migrate UI primitives (Modal, Button, Input, Badge)

**Files:**
- Modify: `cis-deal-room/src/components/ui/Modal.tsx`
- Modify: `cis-deal-room/src/components/ui/Button.tsx`
- Modify: `cis-deal-room/src/components/ui/Input.tsx`
- Modify: `cis-deal-room/src/components/ui/Badge.tsx`

- [ ] **Step 1: Migrate Modal**

Open `cis-deal-room/src/components/ui/Modal.tsx`. Replace all hex color references in `className` props with semantic classes. Mapping:

| Old | New |
|---|---|
| `bg-black/70 backdrop-blur-sm` | `bg-text-primary/40 backdrop-blur-sm` |
| `bg-[#141414]` | `bg-surface` |
| `border-[#2A2A2A]` | `border-border` |
| `text-white` | `text-text-primary` |
| `text-neutral-400` | `text-text-muted` |
| `focus:ring-[#E10600]` | `focus:ring-accent` |
| `hover:text-white` | `hover:text-text-primary` |

Also increase `shadow-2xl` to work on light backgrounds — a light-theme modal needs a visible border OR a soft shadow. Keep the border-border class and the existing shadow.

- [ ] **Step 2: Migrate Button**

Open `cis-deal-room/src/components/ui/Button.tsx`. Map:

| Old | New |
|---|---|
| `bg-[#E10600]` | `bg-accent` |
| `hover:bg-[#C40500]` | `hover:bg-accent-hover` |
| `text-white` on primary | `text-text-inverse` |
| `bg-[#1F1F1F]` on secondary | `bg-surface-sunken` |
| `hover:bg-[#2A2A2A]` on secondary | `hover:bg-border-subtle` |
| `text-neutral-300` on secondary | `text-text-primary` |
| `border-[#2A2A2A]` | `border-border` |

- [ ] **Step 3: Migrate Input**

Open `cis-deal-room/src/components/ui/Input.tsx`. Map:

| Old | New |
|---|---|
| `bg-[#1F1F1F]` | `bg-surface-sunken` |
| `border-[#2A2A2A]` | `border-border` |
| `text-white` | `text-text-primary` |
| `placeholder:text-neutral-500` | `placeholder:text-text-muted` |
| `focus:ring-[#E10600]` | `focus:ring-accent` |

- [ ] **Step 4: Migrate Badge**

Open `cis-deal-room/src/components/ui/Badge.tsx`. This component uses `WorkspaceStatus` variants. For each variant color, use the semantic status tokens:

- `engagement`: `bg-surface-sunken text-text-secondary border-border`
- `active_dd`: `bg-success-subtle text-success border-success/30` (green tint)
- `ioi_stage`: `bg-warning-subtle text-warning border-warning/30` (yellow tint)
- `closing`: `bg-accent-subtle text-accent border-accent/30` (red tint, brand-aligned)
- `closed`: `bg-surface-sunken text-text-muted border-border` (gray)
- `archived`: `bg-surface-sunken text-text-muted border-border` (gray, same as closed)

- [ ] **Step 5: Typecheck + run full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: zero TS errors, all tests still GREEN.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/components/ui/ && git commit -m "feat(ui): migrate Modal/Button/Input/Badge to semantic design tokens"
```

---

## Task 4: Migrate auth surfaces (LoginPage, VerifyPage)

**Files:**
- Modify: `cis-deal-room/src/app/(auth)/login/page.tsx` (and any sibling components in that directory)
- Modify: `cis-deal-room/src/app/auth/verify/page.tsx`

- [ ] **Step 1: Read the current login page**

```bash
find cis-deal-room/src/app/\(auth\)/login -type f
cat cis-deal-room/src/app/\(auth\)/login/page.tsx
```

Note any child components (LoginForm, etc.) and migrate them too.

- [ ] **Step 2: Replace the placeholder logo with `<Logo />`**

Wherever the login/verify pages render the red-square + "CIS Partners" text placeholder (look for `bg-[#E10600]` in a small `<div>` followed by a `<span>` with "CIS Partners"), replace with:

```tsx
import { Logo } from '@/components/ui/Logo';

// …replace the placeholder block with:
<Logo size="md" className="mx-auto mb-8" />
```

- [ ] **Step 3: Migrate all hex references in the page & its children**

Apply the same mapping as Task 3 (bg, border, text). The `main` wrapper's `bg-black` becomes `bg-bg`. Card container `bg-[#141414] border-[#2A2A2A]` becomes `bg-surface border-border shadow-sm`.

- [ ] **Step 4: Migrate VerifyPage error UI**

Open `cis-deal-room/src/app/auth/verify/page.tsx`. Replace the placeholder logo (same pattern) with `<Logo size="md" />`. Migrate all hex classes. Error text: red color → `text-accent` or `text-danger` depending on severity (use `text-danger` for "Invalid link"/"Expired", since this is an error state, not a brand moment).

- [ ] **Step 5: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/app/\(auth\)/ src/app/auth/ && git commit -m "feat(ui): migrate auth pages to light theme and real logo"
```

---

## Task 5: Migrate deal list + `NewDealModal`

**Files:**
- Modify: `cis-deal-room/src/app/(app)/deals/page.tsx`
- Modify: `cis-deal-room/src/components/deals/DealList.tsx`
- Modify: `cis-deal-room/src/components/deals/NewDealModal.tsx`

- [ ] **Step 1: Read the three files**

Check what's currently hardcoded. The deal list page likely has a page-level wrapper with dark background and a header with placeholder logo.

- [ ] **Step 2: Migrate the deal-list page wrapper**

Replace `bg-black`/`bg-[#0D0D0D]` on the page wrapper with `bg-bg`. Header with logo and user controls: replace placeholder with `<Logo size="md" />`.

- [ ] **Step 3: Migrate `DealList.tsx`**

Apply the color mapping to row backgrounds (`bg-[#141414]` → `bg-surface`, hover state `hover:bg-[#1F1F1F]` → `hover:bg-surface-elevated`). Row borders → `border-border-subtle`. Text hierarchy: deal name = `text-text-primary`, client name / metadata = `text-text-secondary`, timestamp = `text-text-muted`.

- [ ] **Step 4: Migrate `NewDealModal.tsx`**

Form inputs inherit from the migrated Input component (Task 3). Migrate any remaining inline hex. Error text: `text-accent` for "required" messages (brand red as error in forms is a deliberate choice that reinforces the brand).

- [ ] **Step 5: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/app/\(app\)/deals/ src/components/deals/ && git commit -m "feat(ui): migrate deal list + NewDealModal to light theme"
```

---

## Task 6: Migrate WorkspaceShell + back-nav UX fix (#1)

**Files:**
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Add logo and "All Deals" back-link to the header**

Open `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`. In the top header (currently the `<header className="h-14 bg-[#141414] ...">` block), replace the placeholder logo with:

```tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

// …inside the header, replace the placeholder logo block with:
<Link
  href="/deals"
  className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
  aria-label="Back to deal rooms"
>
  <ArrowLeft size={16} />
  <Logo size="sm" />
</Link>
```

Rationale: clicking the logo-with-arrow is the universal "home" affordance; no need for a separate breadcrumb.

- [ ] **Step 2: Add a "Deal overview" button to the folder sidebar area**

Currently the center panel shows `DealOverview` only when `selectedFolderId === null`. Add a button at the top of the folder sidebar (in `FolderSidebar.tsx`, which Task 7 will migrate — but the wiring change belongs here):

Just above the FolderSidebar render in WorkspaceShell, or pass a new prop `onShowOverview={() => setSelectedFolderId(null)}` down. FolderSidebar (Task 7) will render the button.

Simpler: add state in WorkspaceShell and pass down. For this task, pass `selectedFolderId` and `onFolderSelect` as-is; Task 7 will add the "Deal overview" list item.

- [ ] **Step 3: Migrate all color hex references in WorkspaceShell**

Same mapping as prior tasks. Three-panel layout backgrounds:
- Page wrapper: `bg-bg`
- Header: `bg-surface border-border`
- Left sidebar wrapper: `bg-surface border-r border-border`
- Center main: `bg-surface-elevated border-x border-border`
- Right panel wrapper: `bg-surface border-l border-border`

Status dropdown: reuse Badge (already migrated). Dropdown popup: `bg-surface border-border shadow-md`.

- [ ] **Step 4: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/WorkspaceShell.tsx && git commit -m "feat(ui): migrate WorkspaceShell to light theme + add back-to-deals link"
```

---

## Task 7: Migrate FolderSidebar + FileList + DealOverview

**Files:**
- Modify: `cis-deal-room/src/components/workspace/FolderSidebar.tsx`
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx`
- Modify: `cis-deal-room/src/components/workspace/DealOverview.tsx`

- [ ] **Step 1: Migrate FolderSidebar + add "Deal overview" item**

Open `cis-deal-room/src/components/workspace/FolderSidebar.tsx`. At the top of the folder list (above the mapped folders), add a selectable "Deal overview" entry that clears the selection:

```tsx
import { LayoutGrid } from 'lucide-react';

// …inside the folder list, before the mapped folders:
<button
  onClick={() => onFolderSelect(null)}
  className={clsx(
    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
    selectedFolderId === null
      ? 'bg-accent-subtle text-accent'
      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
  )}
>
  <LayoutGrid size={15} />
  Deal overview
</button>
```

Migrate all hex references: sidebar bg → `bg-surface`, border → `border-border`, folder row hover → `bg-surface-elevated`, selected-row bg → `bg-accent-subtle text-accent`, text → `text-text-primary`/`text-text-secondary` per hierarchy.

- [ ] **Step 2: Migrate FileList**

Open `cis-deal-room/src/components/workspace/FileList.tsx`. Migrate the folder header, search input (which uses the Input component but also has inline classes), Upload button (uses semantic token via Button migration).

File table:
- Header row: `bg-surface-elevated text-text-muted` + `border-border-subtle`
- Rows: default `bg-surface`, hover `hover:bg-surface-elevated`, selected `bg-accent-subtle`
- Icon colors: keep type-based (`text-accent` for PDF is on-brand for CIS-critical docs, `text-success` for spreadsheet, etc.) but derive from semantic tokens when possible.

- [ ] **Step 3: Migrate DealOverview**

Open `cis-deal-room/src/components/workspace/DealOverview.tsx`. This is the landing view. Migrate all hex to semantic classes. If it currently has `bg-[#0D0D0D]` or similar, swap to `bg-bg`. Cards within: `bg-surface border-border`.

- [ ] **Step 4: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/FolderSidebar.tsx src/components/workspace/FileList.tsx src/components/workspace/DealOverview.tsx && git commit -m "feat(ui): migrate folder sidebar + file list + deal overview to light theme"
```

---

## Task 8: Migrate RightPanel + Participant components

**Files:**
- Modify: `cis-deal-room/src/components/workspace/RightPanel.tsx`
- Modify: `cis-deal-room/src/components/workspace/ParticipantList.tsx`
- Modify: `cis-deal-room/src/components/workspace/ParticipantFormModal.tsx`

- [ ] **Step 1: Migrate RightPanel**

Tab bar: `border-border`, active tab `text-accent border-accent`, inactive `text-text-secondary hover:text-text-primary`. Placeholder content: `bg-surface-elevated` circle icon, `text-text-muted` body.

- [ ] **Step 2: Migrate ParticipantList**

Participant row: `bg-surface border-border rounded-md` (replace the current `bg-[#1A1A1A]`). Status pill (inline spans from Task 3.5 Phase 3.2 work): "Active" → `bg-success-subtle text-success border-success/30`; "Invited" → `bg-surface-sunken text-text-secondary border-border`. Edit/Remove icons: `text-text-muted hover:text-text-primary` for Edit, `text-text-muted hover:text-danger` for Remove.

- [ ] **Step 3: Migrate ParticipantFormModal**

Inherits Modal + Input + Button migrations. Remaining inline hex on the form body: labels `text-text-secondary`, the error line beneath the form → `text-danger`.

- [ ] **Step 4: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/RightPanel.tsx src/components/workspace/ParticipantList.tsx src/components/workspace/ParticipantFormModal.tsx && git commit -m "feat(ui): migrate right panel + participant components to light theme"
```

---

## Task 9: Migrate UploadModal + UX fixes #2a and #2b

**Files:**
- Modify: `cis-deal-room/src/components/workspace/UploadModal.tsx`

- [ ] **Step 1: Add `useEffect` to clear queue when modal closes (UX fix #2b)**

Open `cis-deal-room/src/components/workspace/UploadModal.tsx`. Near the other `useState` declarations, add:

```typescript
import { useEffect } from 'react';

// …inside the component, after state declarations:
useEffect(() => {
  if (!open) {
    // Clear state when modal is dismissed by any path (Done, Cancel, or
    // automatic close-after-upload via onUploadComplete).
    setQueue([]);
    setUploading(false);
  }
}, [open]);
```

- [ ] **Step 2: Hide folder dropdown when opened from a folder context (UX fix #2a)**

Find the folder selector section (the `<label>Upload to folder</label>` block). Wrap it in a conditional:

```tsx
{initialFolderId ? (
  <div>
    <label className="block text-sm font-medium text-text-secondary mb-1.5">
      Uploading to
    </label>
    <div className="px-3 py-2 bg-surface-sunken border border-border rounded-md text-sm text-text-primary">
      {folders.find((f) => f.id === initialFolderId)?.name ?? 'Folder'}
    </div>
  </div>
) : (
  <div>
    <label htmlFor="upload-folder" className="block text-sm font-medium text-text-secondary mb-1.5">
      Upload to folder
    </label>
    <select
      id="upload-folder"
      value={selectedFolderId}
      onChange={(e) => setSelectedFolderId(e.target.value)}
      disabled={uploading}
      className="w-full bg-surface-sunken border border-border rounded-md px-3 py-2 text-sm
        text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {folders.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  </div>
)}
```

Rationale: when admin clicks Upload from within Folder X, showing a dropdown is noise — the target is unambiguous. When clicking Upload from the deal overview (no folder selected), the dropdown is necessary.

- [ ] **Step 3: Migrate the rest of the UploadModal to semantic tokens**

Drop-zone border + bg, queued file rows, progress bar, status icons, buttons — apply the standard mapping. Progress bar uses `bg-accent` fill on `bg-border-subtle` track. Error text: `text-danger`. Success check: `text-success`. Warning (duplicate): `text-warning`.

- [ ] **Step 4: Typecheck + run suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/UploadModal.tsx && git commit -m "feat(ui): UploadModal light theme + auto-clear queue + conditional folder dropdown"
```

---

## Task 10: Migrate email templates

**Files:**
- Modify: `cis-deal-room/src/lib/email/magic-link.tsx`
- Modify: `cis-deal-room/src/lib/email/invitation.tsx`
- Modify: `cis-deal-room/src/lib/email/upload-batch.tsx`

Email templates can't reference relative `/cis-partners-logo.svg` — email clients resolve image URLs absolutely. Use `process.env.NEXT_PUBLIC_APP_URL` to build the absolute URL.

- [ ] **Step 1: Add logo image to each template**

For each of the three templates, replace the current `<Text style={logoPlaceholderStyle}>CIS Partners</Text>` block with:

```tsx
import { Img } from '@react-email/components';

// …inside the email body, replacing the placeholder Text:
<Img
  src={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/cis-partners-logo.svg`}
  alt="CIS Partners"
  width="160"
  style={{ display: 'block', marginBottom: '32px' }}
/>
```

- [ ] **Step 2: Refresh email styling for consistency with the app**

Emails already render on a light background, so most styling is already close. Verify:
- `bodyStyle.backgroundColor`: `#F4F4F5` (maps to surface-sunken)
- `containerStyle.backgroundColor`: `#FFFFFF` (surface)
- Headings: `#0D0D0D`
- Body text: `#3F3F46` → change to `#52525B` to match `--color-text-secondary`
- Button: `#E10600` background (unchanged — accent)
- Small text: `#71717A` → change to `#A1A1AA` for `--color-text-muted`
- Footer: `#A1A1AA` (unchanged)

The email styles don't use Tailwind — they're inline CSS. Keep inline but use the new hex values so emails match the app's semantic palette.

- [ ] **Step 3: Typecheck**

```bash
cd cis-deal-room && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/lib/email/ && git commit -m "feat(email): embed logo and align palette with app tokens"
```

---

## Task 11: Visual verification pass + checkpoint update

**Files:**
- Modify: `cis-deal-room/docs/phase-3-checkpoint.md`

- [ ] **Step 1: Run the complete test suite + typecheck**

```bash
cd cis-deal-room && npx vitest run && npx tsc --noEmit
```

Expected: zero errors, all tests GREEN. If any tests fail because they assert on specific hex values in `className`, update the tests to assert the new semantic class names — but resist changing visual tests just to get a green run.

- [ ] **Step 2: Append visual-verification steps to the checkpoint doc**

Open `cis-deal-room/docs/phase-3-checkpoint.md`. Append a new section before the "Sign-off" table:

```markdown
### Visual verification (Phase 3.5)

- [ ] Login page: white background, CIS Partners logo centered above the form, red "Send magic link" button, no stray dark-theme artifacts.
- [ ] Verify error page: same light background + real logo.
- [ ] Deal list: rows on white cards, status badges are color-coded (green Active DD, yellow IOI, red Closing, neutral others), "New Deal" button is red.
- [ ] Inside a workspace: top-left shows arrow + CIS logo that links back to /deals; clicking it navigates home.
- [ ] Folder sidebar: "Deal overview" entry is above the folder list; clicking it clears the folder selection and shows the DealOverview center panel.
- [ ] File list: white rows, red accents only on the Upload button and version chips.
- [ ] Upload modal: when opened from a folder, shows "Uploading to: <folder name>" (no dropdown); when opened from Deal overview, the dropdown returns.
- [ ] Upload modal: after upload completes and you reopen, the queue is empty (no stale done files).
- [ ] Participants tab: "Active" rows have a green status pill; "Invited" rows have a neutral pill. Edit/Remove icons only visible for admins.
- [ ] Emails: inspect server stub logs for three email types; the HTML previews (saved in your inbox if live Resend is configured) show the real logo and match the app palette.
```

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add docs/phase-3-checkpoint.md && git commit -m "docs(checkpoint): add Phase 3.5 visual verification steps"
```

- [ ] **Step 4: Run the verification**

Open the browser, walk through every item in the new section. Fix any regressions. (No subagent can do this step — it's eyeball work.)

---

## Self-Review Checklist

After all tasks:

```bash
cd cis-deal-room && npx vitest run && npx tsc --noEmit
```

Both pass with zero errors.

**Coverage:**
- [x] Semantic tokens defined — Task 1
- [x] Every component migrated off hex — Tasks 3–10
- [x] Real logo on every surface — Tasks 2, 4, 6, 10
- [x] UX fix #1 (workspace back-nav) — Task 6 + Task 7 (overview entry)
- [x] UX fix #2a (upload folder dropdown) — Task 9
- [x] UX fix #2b (upload queue reset) — Task 9
- [x] Visual verification in checkpoint — Task 11

**Known follow-ups (deferred):**
- Dark-mode toggle — design tokens make it a one-file flip if ever wanted, but not shipped here.
- Real S3 / local-fs fallback for working downloads — item 3b, not this plan.
- Responsive / mobile layout — Phase 4 territory (UI-06).

---

*Phase 3.5 complete when checkpoint visual verification signs off.*
