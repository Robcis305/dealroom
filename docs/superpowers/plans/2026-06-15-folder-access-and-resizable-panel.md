# Folder Access Visibility + Resizable/Collapsible Right Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which participants can access an open folder (header indicator + popover, and a folder-scoped filter in the Participants panel), and make the right-hand panel resizable and collapsible.

**Architecture:** Both features are client-only. Folder access is derived from data the UI already fetches (`GET /api/workspaces/{id}/participants` returns each participant's `role` and `folderIds`). A single pure helper (`hasFolderAccess`) is the shared source of truth so the header indicator and the panel filter cannot drift. Panel resize/collapse is local UI state in `WorkspaceShell`. No schema, migration, API, or DB changes.

**Tech Stack:** Next.js (App Router), React client components, Tailwind, lucide-react icons, Vitest + @testing-library/react. Tests live under `src/test/`. Run all from `cis-deal-room/`.

**Working directory for all commands:** `/Users/robertlevin/development/Deal Rooms/cis-deal-room`

---

## File structure

**Feature 1 — folder access visibility**
- Create: `src/lib/participants/folder-access.ts` — pure predicate `hasFolderAccess` + `isFullAccessRole`
- Create: `src/test/lib/folder-access.test.ts` — unit tests for the predicate
- Create: `src/components/workspace/FolderAccessIndicator.tsx` — avatar-stack + count + popover for the folder header
- Create: `src/test/components/FolderAccessIndicator.test.tsx` — component tests
- Modify: `src/components/workspace/FileList.tsx` — render indicator in the folder header; accept `cisAdvisorySide` + `participantsRefresh`
- Modify: `src/components/workspace/ParticipantList.tsx` — accept `folderId`/`folderName`; folder-scoped filter + toggle
- Modify: `src/test/components/ParticipantList.test.tsx` — add folder-filter tests
- Modify: `src/components/workspace/RightPanel.tsx` — pass `folderId`/`folderName` through; add collapse button

**Feature 2 — resizable/collapsible panel**
- Modify: `src/components/workspace/WorkspaceShell.tsx` — panel width/collapse state, drag handle, reopen rail; thread the new props into `FileList` and `RightPanel`

---

## Task 1: `hasFolderAccess` shared predicate

**Files:**
- Create: `src/lib/participants/folder-access.ts`
- Test: `src/test/lib/folder-access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/lib/folder-access.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasFolderAccess, isFullAccessRole } from '@/lib/participants/folder-access';

describe('isFullAccessRole()', () => {
  it('is true for admin and cis_team', () => {
    expect(isFullAccessRole('admin')).toBe(true);
    expect(isFullAccessRole('cis_team')).toBe(true);
  });
  it('is false for other roles', () => {
    expect(isFullAccessRole('client')).toBe(false);
    expect(isFullAccessRole('seller_rep')).toBe(false);
    expect(isFullAccessRole('view_only')).toBe(false);
  });
});

describe('hasFolderAccess()', () => {
  const FOLDER = 'folder-1';
  it('returns true for admin/cis_team even with no explicit grants', () => {
    expect(hasFolderAccess({ role: 'admin', folderIds: [] }, FOLDER)).toBe(true);
    expect(hasFolderAccess({ role: 'cis_team', folderIds: [] }, FOLDER)).toBe(true);
  });
  it('returns true for a non-admin with an explicit grant', () => {
    expect(hasFolderAccess({ role: 'client', folderIds: ['folder-1', 'folder-2'] }, FOLDER)).toBe(true);
  });
  it('returns false for a non-admin without a grant', () => {
    expect(hasFolderAccess({ role: 'client', folderIds: ['folder-2'] }, FOLDER)).toBe(false);
  });
  it('returns true for an invited (not yet active) participant holding a grant', () => {
    // status is irrelevant to the predicate — grant presence is what matters
    expect(hasFolderAccess({ role: 'seller_rep', folderIds: ['folder-1'] }, FOLDER)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/lib/folder-access.test.ts`
Expected: FAIL — cannot resolve `@/lib/participants/folder-access`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/participants/folder-access.ts`:

```ts
import type { ParticipantRole } from '@/types';

/** Roles that can see every folder regardless of explicit folder_access rows. */
export function isFullAccessRole(role: ParticipantRole): boolean {
  return role === 'admin' || role === 'cis_team';
}

/**
 * Whether a participant can access the given folder.
 *
 * Admins / cis_team bypass folder_access checks server-side and hold no
 * folder_access rows, so they have implicit access to every folder and always
 * return true. Everyone else needs an explicit grant in `folderIds`.
 */
export function hasFolderAccess(
  participant: { role: ParticipantRole; folderIds: string[] },
  folderId: string,
): boolean {
  if (isFullAccessRole(participant.role)) return true;
  return participant.folderIds.includes(folderId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/lib/folder-access.test.ts`
Expected: PASS (8 assertions across 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/participants/folder-access.ts src/test/lib/folder-access.test.ts
git commit -m "feat(folder-access): hasFolderAccess shared predicate"
```

---

## Task 2: `FolderAccessIndicator` component

Avatar stack + "N with access" label that opens a popover listing the participants who can access the open folder. Fetches participants itself (the endpoint is available to all roles) and refetches when `refreshToken` changes.

**Files:**
- Create: `src/components/workspace/FolderAccessIndicator.tsx`
- Test: `src/test/components/FolderAccessIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/components/FolderAccessIndicator.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderAccessIndicator } from '@/components/workspace/FolderAccessIndicator';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

const rows = [
  { id: 'admin1', email: 'admin@cis.com', firstName: 'Adam', lastName: 'Min',
    role: 'admin' as const, status: 'active', folderIds: [] },
  { id: 'p1', email: 'client@x.com', firstName: null, lastName: null,
    role: 'client' as const, status: 'active', folderIds: ['folder-1'] },
  { id: 'p2', email: 'rep@x.com', firstName: null, lastName: null,
    role: 'seller_rep' as const, status: 'invited', folderIds: ['folder-2'] },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => rows,
  } as Response);
});

describe('FolderAccessIndicator', () => {
  it('counts admins (implicit) + explicitly granted participants for the open folder', async () => {
    render(
      <FolderAccessIndicator
        workspaceId={WORKSPACE_ID}
        folderId="folder-1"
        cisAdvisorySide="buyer_side"
        refreshToken={0}
      />
    );
    // admin (implicit) + client (granted) = 2; rep is granted folder-2, excluded
    await waitFor(() => expect(screen.getByText('2 with access')).toBeInTheDocument());
  });

  it('opens a popover listing participants, marking admins as Full access', async () => {
    render(
      <FolderAccessIndicator
        workspaceId={WORKSPACE_ID}
        folderId="folder-1"
        cisAdvisorySide="buyer_side"
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('2 with access')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /users with access to this folder/i }));
    expect(screen.getByText('Adam Min')).toBeInTheDocument();
    expect(screen.getByText('client@x.com')).toBeInTheDocument();
    expect(screen.getByText('Full access')).toBeInTheDocument();
    expect(screen.queryByText('rep@x.com')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/components/FolderAccessIndicator.test.tsx`
Expected: FAIL — cannot resolve `@/components/workspace/FolderAccessIndicator`.

- [ ] **Step 3: Write the component**

Create `src/components/workspace/FolderAccessIndicator.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';
import { roleLabel } from '@/lib/participants/roles';
import { hasFolderAccess, isFullAccessRole } from '@/lib/participants/folder-access';
import type { CisAdvisorySide, ParticipantRole } from '@/types';

interface ParticipantRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ParticipantRole;
  status: string;
  folderIds: string[];
}

interface FolderAccessIndicatorProps {
  workspaceId: string;
  folderId: string;
  cisAdvisorySide: CisAdvisorySide;
  /** Incremented by the parent after invites/edits to trigger a refetch */
  refreshToken: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function FolderAccessIndicator({
  workspaceId,
  folderId,
  cisAdvisorySide,
  refreshToken,
}: FolderAccessIndicatorProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`);
    if (res.ok) setRows(await res.json());
  }, [workspaceId]);

  useEffect(() => { load(); }, [load, refreshToken]);
  // Close the popover whenever the open folder changes
  useEffect(() => { setOpen(false); }, [folderId]);

  const withAccess = rows.filter((r) => hasFolderAccess(r, folderId));
  if (withAccess.length === 0) return null;

  const shown = withAccess.slice(0, 4);
  const overflow = withAccess.length - shown.length;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Users with access to this folder"
        aria-expanded={open}
        title="Users with access to this folder"
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-elevated
          transition-colors cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex -space-x-2">
          {shown.map((r) => (
            <span
              key={r.id}
              className="w-6 h-6 rounded-full bg-surface-elevated border border-border
                flex items-center justify-center text-[10px] font-semibold text-text-secondary"
            >
              {initials(displayName(r))}
            </span>
          ))}
          {overflow > 0 && (
            <span className="w-6 h-6 rounded-full bg-surface-elevated border border-border
              flex items-center justify-center text-[10px] font-semibold text-text-secondary">
              +{overflow}
            </span>
          )}
        </span>
        <span className="text-xs text-text-muted whitespace-nowrap">
          {withAccess.length} with access
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 mt-2 w-64 z-20 bg-surface border border-border
            rounded-lg shadow-lg p-2">
            <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-text-secondary">
              <Users size={12} aria-hidden="true" />
              Users with access to this folder
            </p>
            <ul className="mt-1 space-y-0.5 max-h-72 overflow-y-auto">
              {withAccess.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md
                    hover:bg-surface-elevated"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary truncate">{displayName(r)}</span>
                    <span className="block text-xs text-text-muted truncate">
                      {roleLabel(r.role, cisAdvisorySide)}
                    </span>
                  </span>
                  {isFullAccessRole(r.role) ? (
                    <span className="shrink-0 text-[10px] font-medium text-text-muted
                      border border-border rounded px-1.5 py-0.5">
                      Full access
                    </span>
                  ) : r.status === 'invited' ? (
                    <span className="shrink-0 text-[10px] font-medium text-text-secondary
                      border border-border rounded px-1.5 py-0.5">
                      Invited
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/components/FolderAccessIndicator.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/FolderAccessIndicator.tsx src/test/components/FolderAccessIndicator.test.tsx
git commit -m "feat(folder-access): FolderAccessIndicator avatar stack + popover"
```

---

## Task 3: Render the indicator in the folder header

`FileList` owns the "Deal Documents" / folder-name header. Add the indicator next to the title and accept the two new props it needs.

**Files:**
- Modify: `src/components/workspace/FileList.tsx`

- [ ] **Step 1: Add imports**

In `src/components/workspace/FileList.tsx`, after the existing `import { PreviewModal, type PreviewFile } from './PreviewModal';` line (line 17), add:

```tsx
import { FolderAccessIndicator } from './FolderAccessIndicator';
import type { CisAdvisorySide } from '@/types';
```

- [ ] **Step 2: Extend the props interface**

Replace the `FileListProps` interface (lines 36-48) with:

```tsx
interface FileListProps {
  workspaceId: string;
  folderId: string;
  folderName: string;
  isAdmin: boolean;
  onUpload: () => void;
  /** Incremented externally after a successful upload to trigger refetch */
  uploadRevision?: number;
  /** All folders in the workspace — used by the Move-to-folder action */
  folders: FolderRef[];
  /** Called on delete (negative delta) and restore (positive delta) to keep sidebar counts live */
  onFolderCountChange?: (folderId: string, delta: number) => void;
  /** CIS advisory side — needed for contextual role labels in the access popover */
  cisAdvisorySide: CisAdvisorySide;
  /** Incremented by the parent after invites/edits so the access indicator refetches */
  participantsRefresh?: number;
}
```

- [ ] **Step 3: Destructure the new props**

Replace the function signature line (line 65):

```tsx
export function FileList({ workspaceId, folderId, folderName, isAdmin, onUpload, uploadRevision = 0, folders, onFolderCountChange }: FileListProps) {
```

with:

```tsx
export function FileList({ workspaceId, folderId, folderName, isAdmin, onUpload, uploadRevision = 0, folders, onFolderCountChange, cisAdvisorySide, participantsRefresh = 0 }: FileListProps) {
```

- [ ] **Step 4: Render the indicator beside the title**

Replace the header title element (line 294):

```tsx
        <h2 className="text-lg font-semibold text-text-primary tracking-tight">{folderName}</h2>
```

with:

```tsx
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-semibold text-text-primary tracking-tight truncate">{folderName}</h2>
          <FolderAccessIndicator
            workspaceId={workspaceId}
            folderId={folderId}
            cisAdvisorySide={cisAdvisorySide}
            refreshToken={participantsRefresh}
          />
        </div>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors. (`FileList` now requires `cisAdvisorySide`; its only caller is updated in Task 6. If running this task in isolation before Task 6, expect one error at the `WorkspaceShell` call site — that is resolved in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/FileList.tsx
git commit -m "feat(folder-access): show access indicator in folder header"
```

---

## Task 4: Folder-scoped filter + toggle in the Participants panel

`ParticipantList` gains an optional `folderId`/`folderName`. When a folder is open it defaults to showing only participants with access to that folder, under a "Users with access to this folder" header, with a toggle back to all participants. When `folderId` is null/undefined, behavior is unchanged.

**Files:**
- Modify: `src/components/workspace/ParticipantList.tsx`
- Test: `src/test/components/ParticipantList.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/test/components/ParticipantList.test.tsx`, append this `describe` block at the end of the file (after the closing of the existing top-level `describe`):

```tsx
describe('ParticipantList — folder scope', () => {
  const folderRows = [
    { id: 'a1', userId: 'ua', email: 'admin@cis.com', firstName: 'Adam', lastName: 'Min',
      role: 'admin' as const, status: 'active', invitedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(), folderIds: [], lastSeen: new Date().toISOString() },
    { id: 'c1', userId: 'uc', email: 'client@x.com', firstName: null, lastName: null,
      role: 'client' as const, status: 'active', invitedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(), folderIds: ['folder-1'], lastSeen: new Date().toISOString() },
    { id: 'r1', userId: 'ur', email: 'rep@x.com', firstName: null, lastName: null,
      role: 'seller_rep' as const, status: 'active', invitedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(), folderIds: ['folder-2'], lastSeen: null },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => folderRows,
    } as Response);
  });

  it('shows only participants with access to the open folder by default', async () => {
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin={false}
        refreshToken={0}
        currentUserEmail="someone@else.com"
        folderId="folder-1"
        folderName="Deal Legal"
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    // admin has implicit access; rep is granted folder-2 only and must be hidden
    expect(screen.getByText('Adam Min')).toBeInTheDocument();
    expect(screen.queryByText('rep@x.com')).not.toBeInTheDocument();
    expect(screen.getByText('Users with access to this folder')).toBeInTheDocument();
  });

  it('shows all participants after switching the toggle to "All participants"', async () => {
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin={false}
        refreshToken={0}
        currentUserEmail="someone@else.com"
        folderId="folder-1"
        folderName="Deal Legal"
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    expect(screen.queryByText('rep@x.com')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /all participants/i }));
    expect(screen.getByText('rep@x.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/components/ParticipantList.test.tsx`
Expected: FAIL — `folderId`/`folderName` props don't exist; "Users with access to this folder" not found; `rep@x.com` still renders.

- [ ] **Step 3: Add the import**

In `src/components/workspace/ParticipantList.tsx`, after `import { roleLabel } from '@/lib/participants/roles';` (line 7), add:

```tsx
import { hasFolderAccess } from '@/lib/participants/folder-access';
```

- [ ] **Step 4: Extend the props interface**

Replace the `ParticipantListProps` interface (lines 35-44) with:

```tsx
interface ParticipantListProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  isAdmin: boolean;
  /** Parent increments to force a refetch (e.g., after an invite succeeds) */
  refreshToken: number;
  /** Current viewer's email — the row matching this hides its edit/revoke buttons */
  currentUserEmail: string;
  /** When a folder is open, the list scopes to participants with access to it */
  folderId?: string | null;
  /** Display name of the open folder (currently unused in copy, kept for future labels) */
  folderName?: string | null;
}
```

- [ ] **Step 5: Destructure the new props and add scope state**

Replace the function signature + first state hook (lines 46-59):

```tsx
export function ParticipantList({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  refreshToken,
  currentUserEmail,
}: ParticipantListProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [revoking, setRevoking] = useState<ParticipantRow | null>(null);
  const [bump, setBump] = useState(0);
```

with:

```tsx
export function ParticipantList({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  refreshToken,
  currentUserEmail,
  folderId,
  folderName,
}: ParticipantListProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [revoking, setRevoking] = useState<ParticipantRow | null>(null);
  const [bump, setBump] = useState(0);
  const [scope, setScope] = useState<'folder' | 'all'>('folder');

  // Reset to the folder-scoped view whenever the open folder changes
  useEffect(() => { setScope('folder'); }, [folderId]);

  const folderScoped = !!folderId && scope === 'folder';
  const visibleRows = folderScoped
    ? rows.filter((r) => hasFolderAccess(r, folderId!))
    : rows;
```

(`folderName` is intentionally accepted but not referenced in copy yet; the header text is fixed. Keeping the prop documents the data flow and avoids a future signature change.)

- [ ] **Step 6: Render the header + toggle**

In the JSX, immediately after the closing `)}` of the `isAdmin && (...)` invite button block (line 113) and before the `{loading ? (` block, insert:

```tsx
      {folderId && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary">
            {scope === 'folder' ? 'Users with access to this folder' : 'All participants'}
          </p>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setScope('folder')}
              className={clsx(
                'px-2.5 py-1 transition-colors cursor-pointer',
                scope === 'folder'
                  ? 'bg-accent text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              This folder
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={clsx(
                'px-2.5 py-1 border-l border-border transition-colors cursor-pointer',
                scope === 'all'
                  ? 'bg-accent text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              All participants
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Use `visibleRows` for the empty check and the list**

Replace the empty/loaded conditional (lines 115-119):

```tsx
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-muted">No participants yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
```

with:

```tsx
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : visibleRows.length === 0 ? (
        <p className="text-xs text-text-muted">
          {folderScoped ? 'No one has access to this folder yet.' : 'No participants yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/test/components/ParticipantList.test.tsx`
Expected: PASS — both new tests plus all 5 pre-existing tests (which pass no `folderId`, so `folderScoped` is false and behavior is unchanged).

- [ ] **Step 9: Commit**

```bash
git add src/components/workspace/ParticipantList.tsx src/test/components/ParticipantList.test.tsx
git commit -m "feat(folder-access): folder-scoped filter + toggle in Participants panel"
```

---

## Task 5: Thread folder props + collapse control through `RightPanel`

`RightPanel` passes `folderId`/`folderName` down to `ParticipantList` and exposes an optional `onCollapse` that renders a collapse button in the tab bar.

**Files:**
- Modify: `src/components/workspace/RightPanel.tsx`

- [ ] **Step 1: Add the icon import**

Replace the lucide import (line 4):

```tsx
import { Activity, Users } from 'lucide-react';
```

with:

```tsx
import { Activity, Users, PanelRightClose } from 'lucide-react';
```

- [ ] **Step 2: Extend the props interface**

Replace the `RightPanelProps` interface (lines 14-23) with:

```tsx
interface RightPanelProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: Folder[];
  isAdmin: boolean;
  /** Parent increments to force a participant refetch */
  participantsRefreshToken: number;
  /** Current viewer's email — used to hide self-edit/self-revoke buttons */
  currentUserEmail: string;
  /** The open folder (if any) — scopes the Participants tab */
  folderId?: string | null;
  /** Display name of the open folder */
  folderName?: string | null;
  /** When provided, renders a collapse button in the tab bar */
  onCollapse?: () => void;
}
```

- [ ] **Step 3: Destructure the new props**

Replace the destructuring (lines 27-34):

```tsx
export function RightPanel({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  participantsRefreshToken,
  currentUserEmail,
}: RightPanelProps) {
```

with:

```tsx
export function RightPanel({
  workspaceId,
  cisAdvisorySide,
  folders,
  isAdmin,
  participantsRefreshToken,
  currentUserEmail,
  folderId,
  folderName,
  onCollapse,
}: RightPanelProps) {
```

- [ ] **Step 4: Add the collapse button to the tab bar**

Replace the tab-bar block (lines 39-52):

```tsx
      <div className="flex border-b border-border shrink-0">
        <TabButton
          label="Activity"
          icon={<Activity size={14} />}
          active={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
        />
        <TabButton
          label="Participants"
          icon={<Users size={14} />}
          active={activeTab === 'participants'}
          onClick={() => setActiveTab('participants')}
        />
      </div>
```

with:

```tsx
      <div className="flex items-center border-b border-border shrink-0">
        <TabButton
          label="Activity"
          icon={<Activity size={14} />}
          active={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
        />
        <TabButton
          label="Participants"
          icon={<Users size={14} />}
          active={activeTab === 'participants'}
          onClick={() => setActiveTab('participants')}
        />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse side panel"
            title="Collapse panel"
            className="ml-auto mr-1 w-8 h-8 rounded flex items-center justify-center
              text-text-muted hover:text-text-primary hover:bg-surface-elevated
              transition-colors cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>
```

- [ ] **Step 5: Pass folder props into `ParticipantList`**

Replace the `<ParticipantList ... />` element (lines 58-65):

```tsx
          <ParticipantList
            workspaceId={workspaceId}
            cisAdvisorySide={cisAdvisorySide}
            folders={folders}
            isAdmin={isAdmin}
            refreshToken={participantsRefreshToken}
            currentUserEmail={currentUserEmail}
          />
```

with:

```tsx
          <ParticipantList
            workspaceId={workspaceId}
            cisAdvisorySide={cisAdvisorySide}
            folders={folders}
            isAdmin={isAdmin}
            refreshToken={participantsRefreshToken}
            currentUserEmail={currentUserEmail}
            folderId={folderId}
            folderName={folderName}
          />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS for `RightPanel` itself. (The `WorkspaceShell` call site error from Task 3's `FileList` change is still expected until Task 6.)

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/RightPanel.tsx
git commit -m "feat(folder-access): pass folder scope + collapse control through RightPanel"
```

---

## Task 6: Resizable / collapsible panel in `WorkspaceShell`

Add panel width + collapse state, a drag handle, and a reopen rail. Thread the new `FileList` props (`cisAdvisorySide`, `participantsRefresh`) and `RightPanel` props (`folderId`, `folderName`, `onCollapse`).

**Files:**
- Modify: `src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Add icon + hook imports**

Replace the React import (line 3):

```tsx
import { useState, useEffect, useCallback } from 'react';
```

with:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
```

Replace the lucide import (line 5):

```tsx
import { ChevronDown, ArrowLeft, Upload } from 'lucide-react';
```

with:

```tsx
import { ChevronDown, ArrowLeft, Upload, PanelRightOpen } from 'lucide-react';
```

- [ ] **Step 2: Add panel state + resize handler**

Immediately after the `pendingHighlight` state line (line 77: `const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);`), insert:

```tsx
  const [panelWidth, setPanelWidth] = useState(320);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const resizingRef = useRef(false);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev: PointerEvent) {
      if (!resizingRef.current) return;
      // Panel is on the right edge: dragging left (smaller clientX) widens it
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(600, Math.max(260, startWidth + delta)));
    }
    function onUp() {
      resizingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    }
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [panelWidth]);
```

- [ ] **Step 3: Pass the new props to `FileList`**

Replace the `<FileList ... />` element (lines 330-339):

```tsx
            <FileList
              workspaceId={workspace.id}
              folderId={view.folderId}
              folderName={folders.find((f) => f.id === view.folderId)?.name ?? 'Files'}
              isAdmin={isAdmin}
              onUpload={() => setShowUploadModal(true)}
              uploadRevision={uploadRevision}
              folders={folders}
              onFolderCountChange={handleFolderCountChange}
            />
```

with:

```tsx
            <FileList
              workspaceId={workspace.id}
              folderId={view.folderId}
              folderName={folders.find((f) => f.id === view.folderId)?.name ?? 'Files'}
              isAdmin={isAdmin}
              onUpload={() => setShowUploadModal(true)}
              uploadRevision={uploadRevision}
              folders={folders}
              onFolderCountChange={handleFolderCountChange}
              cisAdvisorySide={workspace.cisAdvisorySide}
              participantsRefresh={participantsRefresh}
            />
```

- [ ] **Step 4: Replace the right-panel wrapper with resize/collapse markup**

Replace the right panel block (lines 343-353):

```tsx
        {/* Right: RightPanel — 320px */}
        <div className="w-[320px] shrink-0 bg-surface border-l border-border overflow-y-auto hidden lg:flex lg:flex-col">
          <RightPanel
                workspaceId={workspace.id}
                cisAdvisorySide={workspace.cisAdvisorySide}
                folders={folders}
                isAdmin={isAdmin}
                participantsRefreshToken={participantsRefresh}
                currentUserEmail={userEmail}
              />
        </div>
```

with:

```tsx
        {/* Right: resizable / collapsible RightPanel */}
        {panelCollapsed ? (
          <div className="hidden lg:flex flex-col w-10 shrink-0 bg-surface border-l border-border items-center pt-3">
            <button
              type="button"
              aria-label="Open side panel"
              title="Open side panel"
              onClick={() => setPanelCollapsed(false)}
              className="w-8 h-8 rounded flex items-center justify-center text-text-muted
                hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PanelRightOpen size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex shrink-0">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel"
              onPointerDown={startResize}
              className="w-1.5 cursor-col-resize bg-border/40 hover:bg-accent/50 transition-colors"
            />
            <div
              style={{ width: panelWidth }}
              className="shrink-0 bg-surface border-l border-border overflow-y-auto flex flex-col"
            >
              <RightPanel
                workspaceId={workspace.id}
                cisAdvisorySide={workspace.cisAdvisorySide}
                folders={folders}
                isAdmin={isAdmin}
                participantsRefreshToken={participantsRefresh}
                currentUserEmail={userEmail}
                folderId={selectedFolderId}
                folderName={view.kind === 'folder' ? folders.find((f) => f.id === view.folderId)?.name ?? null : null}
                onCollapse={() => setPanelCollapsed(true)}
              />
            </div>
          </div>
        )}
```

- [ ] **Step 5: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors anywhere (all call sites now satisfied).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the new `folder-access`, `FolderAccessIndicator`, and `ParticipantList` folder-scope tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/WorkspaceShell.tsx
git commit -m "feat(panel): resizable + collapsible right panel; wire folder access props"
```

---

## Manual verification (before any deploy)

Run `npm run dev` and, in a workspace as an admin:

1. Open a folder → confirm the avatar stack + "N with access" appears beside the folder name; click it → popover lists the right people, admins tagged "Full access".
2. Open the Participants tab with a folder open → confirm it shows "Users with access to this folder" and only those participants; toggle to "All participants" → full list returns; switch folders → resets to the folder view.
3. Drag the panel's left edge → width changes, clamps between 260px and 600px, center reflows with no overflow.
4. Click collapse → panel becomes a thin rail with a reopen icon; click it → panel restores to its default width.
5. Verify as a non-admin (no folder-management controls) that the folder access list and resize/collapse still behave.

Then follow the standard flow: branch is `feat/ai-data-room-integration`; push, open PR, verify on the Vercel preview against the checklist above before squash-merging to `main`.

---

## Self-review notes

- **Spec coverage:** shared `hasFolderAccess` helper (Task 1) ✓; header indicator + popover with admins as full-access (Tasks 2–3) ✓; panel filter + "This folder / All participants" toggle, visible to everyone, read-only (Task 4) ✓; invited-status participants shown with badge (Tasks 2 & existing list badge) ✓; reactive on folder switch (Tasks 2 & 4 `useEffect` on `folderId`) ✓; resize 260–600 + collapse-to-rail, no persistence, `lg`-only (Task 6) ✓; no schema/API/DB changes ✓.
- **Type consistency:** `hasFolderAccess(participant, folderId)` signature is identical across the helper, indicator, and list. `cisAdvisorySide`/`participantsRefresh` added to `FileList` are supplied by the only caller in Task 6. `folderId`/`folderName`/`onCollapse` flow `WorkspaceShell → RightPanel → ParticipantList` with matching names.
- **No placeholders:** every step has concrete code and exact commands.
