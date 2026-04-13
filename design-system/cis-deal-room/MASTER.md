# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** CIS Deal Room
**Generated:** 2026-04-12
**Category:** Financial SaaS — M&A Deal Management Portal

---

## Global Rules

### Color Palette

> Source of truth: CIS Partners brand colors

| Role | Hex | Tailwind Equivalent | Usage |
|------|-----|---------------------|-------|
| Brand Red | `#E10600` | `bg-[#E10600]` | Primary CTAs, active states, key highlights |
| Brand Red hover | `#C40500` | `bg-[#C40500]` | Button hover, pressed state |
| Brand Red subtle | `#E10600/10` | `bg-[#E10600]/10` | Active row bg, badge bg |
| Brand Black | `#000000` | `bg-black` | Deepest background layer |
| Background (primary) | `#0D0D0D` | `bg-[#0D0D0D]` | Page background |
| Background (elevated) | `#141414` | `bg-[#141414]` | Cards, sidebar, panels |
| Background (surface) | `#1F1F1F` | `bg-[#1F1F1F]` | Input fields, hover rows, dropdowns |
| Border | `#2A2A2A` | `border-[#2A2A2A]` | Dividers, card borders |
| Border subtle | `#1A1A1A` | `border-[#1A1A1A]` | Inner separators |
| Text primary | `#FFFFFF` | `text-white` | Headings, body |
| Text muted | `#A3A3A3` | `text-neutral-400` | Metadata, timestamps |
| Text dim | `#6B6B6B` | `text-neutral-500` | Disabled, placeholder |
| Status: Active DD | `#22C55E` | `text-green-500` | Active DD badge |
| Status: Engagement | `#3B82F6` | `text-blue-500` | Engagement badge |
| Status: IOI Stage | `#EAB308` | `text-yellow-500` | IOI badge |
| Status: Closing | `#F97316` | `text-orange-500` | Closing badge |
| Status: Closed | `#6B6B6B` | `text-neutral-500` | Closed/archived badge |

**Color Notes:** True black base with CIS brand red as the sole accent. Red is used intentionally — primary CTAs, active folder states, focus rings, and key interactive moments only. Status colors remain semantic (green/blue/yellow/orange/gray) and are distinct from the brand red.

### Typography

> Source of truth: CIS Partners brand spec

- **UI / Body Font:** DM Sans (clean, modern sans-serif)
- **Data / Monospace Font:** JetBrains Mono (file sizes, timestamps, IDs, metadata values)
- **Mood:** Professional, clean, high information density, serious but not stuffy

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
```

**Tailwind Config:**
```js
fontFamily: {
  sans: ['DM Sans', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
}
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```tsx
/* Primary — Brand Red */
<button className="bg-[#E10600] hover:bg-[#C40500] text-white px-4 py-2 rounded-lg font-medium
  text-sm transition-colors duration-150 cursor-pointer
  focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-black
  disabled:opacity-40 disabled:cursor-not-allowed">
  Upload Files
</button>

/* Secondary / Ghost */
<button className="bg-transparent hover:bg-[#1F1F1F] text-neutral-300 hover:text-white
  border border-[#2A2A2A] hover:border-[#3A3A3A] px-4 py-2 rounded-lg font-medium
  text-sm transition-colors duration-150 cursor-pointer
  focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:ring-offset-2 focus:ring-offset-black">
  Cancel
</button>

/* Destructive (e.g. Revoke Access) — uses brand red more prominently */
<button className="bg-[#E10600]/10 hover:bg-[#E10600]/20 text-[#E10600] hover:text-[#FF1A17]
  border border-[#E10600]/20 px-4 py-2 rounded-lg font-medium
  text-sm transition-colors duration-150 cursor-pointer">
  Revoke Access
</button>
```

### Cards (Deal Cards)

```tsx
<div className="bg-[#141414] border border-[#2A2A2A] hover:border-[#3A3A3A] rounded-xl p-6
  transition-colors duration-150 cursor-pointer group">
  {/* Content */}
</div>
```

### File List Rows

```tsx
<div className="flex items-center gap-3 px-4 py-3 hover:bg-[#1F1F1F] rounded-lg
  transition-colors duration-150 cursor-pointer group">
  {/* File icon, name, meta */}
</div>
```

### Inputs

```tsx
<input className="w-full bg-[#1F1F1F] border border-[#2A2A2A] text-white
  placeholder:text-neutral-500 px-3 py-2 rounded-lg text-sm font-sans
  focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent
  transition-colors duration-150" />
```

### Modals

```tsx
/* Overlay */
<div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
  {/* Modal panel */}
  <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 shadow-2xl
    w-full max-w-lg mx-4">
    {/* Content */}
  </div>
</div>
```

### Status Badges

```tsx
const statusStyles = {
  engagement: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  active_dd:  'bg-green-500/10 text-green-400 border border-green-500/20',
  ioi_stage:  'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  closing:    'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  closed:     'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20',
  archived:   'bg-neutral-500/10 text-neutral-500 border border-neutral-500/20',
}
// Usage: <span className={`${statusStyles[status]} px-2 py-0.5 rounded-full text-xs font-medium`}>
```

### Sidebar / Navigation

```tsx
/* Active folder item — brand red accent */
<button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
  bg-[#E10600]/10 text-[#E10600] border border-[#E10600]/20 text-sm font-medium
  cursor-pointer">
  {/* Icon + folder name + count */}
</button>

/* Inactive folder item */
<button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
  text-neutral-400 hover:text-white hover:bg-[#1F1F1F] text-sm
  transition-colors duration-150 cursor-pointer">
</button>
```

### Monospace Data Values

```tsx
/* File sizes, timestamps, IDs — use JetBrains Mono */
<span className="font-mono text-xs text-neutral-400">2.4 MB</span>
<span className="font-mono text-xs text-neutral-500">Apr 11, 2026 09:42</span>
```

---

## Style Guidelines

**Style:** Professional Dark SaaS — "Bloomberg Terminal meets modern SaaS"

**Keywords:** Deep navy base, high information density, clean lines, minimal chrome, professional, serious but approachable, data-forward

**Key Effects:**
- Subtle transitions: 150ms for micro-interactions, 200ms for panel/modal animations
- Hover: background color shift (no layout-shifting scale transforms)
- Focus: `ring-2 ring-[#E10600]` with `ring-offset-black`
- Active states: `bg-[#E10600]/10` background with `text-[#E10600]` — brand red, used sparingly
- No decorative gradients, glows, or animation on data panels
- Brand red is reserved for: primary CTAs, active nav items, focus rings, and upload progress — never for status indicators or decorative elements

### Layout Patterns

**App Shell — Three-Panel Workspace:**
```
[Top nav — fixed, 56px]
[Left sidebar — 240px, scrollable folders]
[Center panel — flex-1, file list]
[Right panel — 320px, activity feed / participants]
```

**Tablet (768px):**
- Left sidebar collapses to dropdown at top
- Right panel becomes expandable drawer

**Mobile (375px):**
- Single column, all panels stack vertically
- Use bottom sheet for folder navigation

### Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| Base content | 0 | Page content |
| Sticky headers | 10 | Table headers, top nav |
| Dropdowns | 20 | Role picker, folder selector |
| Modals | 50 | Upload, invite modals |
| Toasts | 60 | Upload success/error notifications |

---

## Anti-Patterns (Do NOT Use)

- ❌ Light mode default
- ❌ Slow rendering

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
