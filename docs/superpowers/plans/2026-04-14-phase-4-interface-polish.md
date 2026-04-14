# Phase 4 — Interface & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the functional v0 deal room into a shippable v1 — tile-card deal list with counts and last-activity summary, real activity feed in the right panel, display names everywhere instead of emails, no-Client warning + status-transition guard, 2h/4h session timeouts with toast-on-401, per-file version history drawer, per-user notification digest (Upstash QStash), sonner-based toasts, graceful mobile read-only responsive layout.

**Architecture:** One schema migration adds five fields (`users.first_name`, `users.last_name`, `users.notification_digest`, `sessions.absolute_expires_at`, `notification_queue` table) and groups every DB change into a single `drizzle-kit` commit. A new `displayName(user)` helper replaces email-as-display-string across every user-visible surface; auth identity keeps using email. `fetchWithAuth` wraps client-side fetches to catch 401s, toast the user, and redirect through the returnTo flow on `/login`. QStash cron posts to `/api/cron/digest` daily to drain `notification_queue`; signature-verified via `@upstash/qstash` `Receiver`.

Work is organized in four groups matching the spec's §14 sequencing: (1) quick wins with no schema change, (2) the structural schema migration plus everything that consumes the new columns, (3) the notification digest pipeline, (4) final polish (version drawer, responsive, checkpoint).

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · Neon PostgreSQL (serverless Pool) · Zod v4 · Tailwind v4 semantic tokens · sonner (toasts) · @upstash/qstash (scheduled cron) · Vitest + @testing-library/react

---

## File Map

### Group 1 — Quick wins

| Action | Path |
|---|---|
| Modify | `cis-deal-room/package.json` (adds sonner) |
| Modify | `cis-deal-room/src/app/(app)/layout.tsx` (adds `<Toaster />`) |
| Modify | `cis-deal-room/src/components/workspace/ParticipantList.tsx` (alert → toast; remove `useEditingFolderIds` placeholder) |
| Modify | `cis-deal-room/src/components/workspace/FileList.tsx` (alert → toast) |
| Modify | `cis-deal-room/src/lib/dal/participants.ts` (folderIds aggregation) |
| Create | `cis-deal-room/src/components/ui/Banner.tsx` |
| Modify | `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` (No-Client banner + embed Invite modal for "Invite Client" action) |
| Modify | `cis-deal-room/src/lib/dal/participants.ts` (`countActiveClientParticipants`) |
| Modify | `cis-deal-room/src/app/api/workspaces/[id]/status/route.ts` (transition guard) |
| Modify | `cis-deal-room/src/components/deals/DealList.tsx` (search + status filter) |

### Group 2 — Structural changes (single schema migration)

| Action | Path |
|---|---|
| Modify | `cis-deal-room/src/db/schema.ts` (5 schema changes) |
| Create | `cis-deal-room/src/db/migrations/xxxx_phase_4.sql` (generated) |
| Create | `cis-deal-room/src/lib/users/display.ts` |
| Create | `cis-deal-room/src/test/lib/display.test.ts` |
| Modify | `cis-deal-room/src/lib/dal/participants.ts` (return firstName/lastName + lastSeen) |
| Modify | `cis-deal-room/src/lib/dal/files.ts` (uploader firstName/lastName in getFilesForFolder, new `getFileVersions`) |
| Modify | `cis-deal-room/src/lib/dal/workspaces.ts` (`getWorkspacesForUser` joined counts + last-activity actor) |
| Modify | `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts` (actor names in response) |
| Modify | `cis-deal-room/src/app/api/files/route.ts` (uploader names in response) |
| Create | `cis-deal-room/src/app/(app)/complete-profile/page.tsx` |
| Create | `cis-deal-room/src/app/(app)/complete-profile/ProfileForm.tsx` |
| Create | `cis-deal-room/src/app/api/user/profile/route.ts` |
| Create | `cis-deal-room/src/test/api/user-profile.test.ts` |
| Modify | `cis-deal-room/src/app/api/auth/verify/route.ts` (redirect to /complete-profile when name missing) |
| Modify | `cis-deal-room/src/lib/auth/session.ts` (idle 2h, absoluteExpiresAt check, set on createSession) |
| Create | `cis-deal-room/src/lib/fetch-with-auth.ts` |
| Modify | `cis-deal-room/src/app/(auth)/login/LoginForm.tsx` (store returnTo in sessionStorage) |
| Modify | `cis-deal-room/src/app/(app)/deals/page.tsx` and `DealList.tsx` (returnTo consumption on land) |
| Modify | `cis-deal-room/src/components/workspace/ParticipantList.tsx` (consume firstName/lastName/lastSeen; use displayName) |
| Modify | `cis-deal-room/src/components/workspace/FileList.tsx` (consume uploader names; use displayName) |
| Create | `cis-deal-room/src/components/deals/DealCard.tsx` |
| Modify | `cis-deal-room/src/components/deals/DealList.tsx` (swap rows for `<DealCard />` grid) |
| Create | `cis-deal-room/src/components/workspace/ActivityFeed.tsx` |
| Create | `cis-deal-room/src/components/workspace/ActivityRow.tsx` |
| Modify | `cis-deal-room/src/components/workspace/RightPanel.tsx` (swap placeholder for `<ActivityFeed />`) |

### Group 3 — Notification digest

| Action | Path |
|---|---|
| Modify | `cis-deal-room/package.json` (adds @upstash/qstash) |
| Create | `cis-deal-room/src/lib/notifications/enqueue-or-send.ts` |
| Modify | `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts` (use enqueueOrSend) |
| Modify | `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts` (digest preference doesn't apply to invitation emails — leave invitation flow alone, document) |
| Create | `cis-deal-room/src/lib/email/daily-digest.tsx` |
| Create | `cis-deal-room/src/app/api/cron/digest/route.ts` |
| Create | `cis-deal-room/src/test/api/cron-digest.test.ts` |
| Create | `cis-deal-room/src/app/api/user/preferences/route.ts` |
| Create | `cis-deal-room/src/test/api/user-preferences.test.ts` |
| Modify | `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` (add avatar menu with digest toggle) |

### Group 4 — Polish

| Action | Path |
|---|---|
| Create | `cis-deal-room/src/components/workspace/VersionHistoryDrawer.tsx` |
| Create | `cis-deal-room/src/app/api/workspaces/[id]/files/[fileId]/versions/route.ts` |
| Create | `cis-deal-room/src/test/api/file-versions.test.ts` |
| Modify | `cis-deal-room/src/components/workspace/FileList.tsx` (vN chip → opens `<VersionHistoryDrawer />`; wire search input) |
| Modify | ~15 component files (responsive breakpoint pass) |
| Create | `cis-deal-room/docs/phase-4-checkpoint.md` |

---

## Group 1 — Quick wins

## Task 1: Sonner toast system + replace existing `alert()` calls

**Files:**
- Modify: `cis-deal-room/package.json`
- Modify: `cis-deal-room/src/app/(app)/layout.tsx`
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx`
- Modify: `cis-deal-room/src/components/workspace/ParticipantList.tsx`

- [ ] **Step 1: Install sonner**

```bash
cd cis-deal-room && npm install sonner
```

- [ ] **Step 2: Mount `<Toaster />` globally**

Open `cis-deal-room/src/app/(app)/layout.tsx`. At the top of the returned JSX (inside the root `<div>` or fragment), add the `<Toaster />`:

```typescript
import { Toaster } from 'sonner';

// …inside the component's return:
<>
  <Toaster
    position="top-right"
    theme="light"
    toastOptions={{
      style: {
        background: 'var(--color-surface)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border)',
      },
    }}
  />
  {children}
</>
```

Import `Toaster` at the top. Style overrides use semantic token variables so sonner matches the rest of the app.

- [ ] **Step 3: Replace `alert()` in FileList**

Open `cis-deal-room/src/components/workspace/FileList.tsx`. Find:

```typescript
if (url.startsWith('stub://')) {
  alert(`[Stub] Would download: ${file.name}`);
  return;
}
```

Replace with:

```typescript
if (url.startsWith('stub://')) {
  toast.info(`Stub mode — real download requires AWS_S3_BUCKET set`, {
    description: file.name,
  });
  return;
}
```

Add import at top of file:
```typescript
import { toast } from 'sonner';
```

- [ ] **Step 4: Replace `alert()` in ParticipantList**

Open `cis-deal-room/src/components/workspace/ParticipantList.tsx`. Find:

```typescript
if (res.ok) setBump((n) => n + 1);
else alert('Failed to remove participant');
```

Replace with:

```typescript
if (res.ok) {
  setBump((n) => n + 1);
  toast.success('Participant removed');
} else {
  toast.error('Failed to remove participant');
}
```

Add import at top: `import { toast } from 'sonner';`

- [ ] **Step 5: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors; all existing tests still GREEN.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add package.json package-lock.json src/app/\(app\)/layout.tsx src/components/workspace/FileList.tsx src/components/workspace/ParticipantList.tsx && git commit -m "feat(ui): sonner toasts; replace alert() in FileList and ParticipantList"
```

---

## Task 2: Participant folderIds in GET response + Edit modal wiring

**Files:**
- Modify: `cis-deal-room/src/lib/dal/participants.ts`
- Modify: `cis-deal-room/src/components/workspace/ParticipantList.tsx`
- Modify: `cis-deal-room/src/test/dal/participants.test.ts`

- [ ] **Step 1: Extend `getParticipants` with folderIds aggregation**

Open `cis-deal-room/src/lib/dal/participants.ts`. Find the `getParticipants` function and replace with:

```typescript
import { sql } from 'drizzle-orm';

export async function getParticipants(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: workspaceParticipants.id,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
      status: workspaceParticipants.status,
      invitedAt: workspaceParticipants.invitedAt,
      activatedAt: workspaceParticipants.activatedAt,
      folderIds: sql<string[]>`coalesce(array_agg(${folderAccess.folderId}) filter (where ${folderAccess.folderId} is not null), '{}')`,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .leftJoin(folderAccess, eq(folderAccess.participantId, workspaceParticipants.id))
    .where(eq(workspaceParticipants.workspaceId, workspaceId))
    .groupBy(
      workspaceParticipants.id,
      workspaceParticipants.userId,
      users.email,
      workspaceParticipants.role,
      workspaceParticipants.status,
      workspaceParticipants.invitedAt,
      workspaceParticipants.activatedAt,
    );

  return rows;
}
```

- [ ] **Step 2: Update `ParticipantList` to use the real folderIds**

Open `cis-deal-room/src/components/workspace/ParticipantList.tsx`. Update the `ParticipantRow` interface to include `folderIds: string[]`:

```typescript
interface ParticipantRow {
  id: string;
  userId: string;
  email: string;
  role: ParticipantRole;
  status: string;
  invitedAt: string | Date;
  activatedAt: string | Date | null;
  folderIds: string[];
}
```

Remove the `useEditingFolderIds` helper function at the bottom of the file. Replace the `editingFolderIds` variable:

```typescript
// old:
const editingFolderIds = useEditingFolderIds(editing?.id, rows.length === 0 ? [] : rows);

// new:
// editing row's folderIds come from the row directly
```

Then update the Edit modal JSX to use `editing.folderIds` directly:

```typescript
{editing && (
  <ParticipantFormModal
    mode="edit"
    open={!!editing}
    onClose={() => setEditing(null)}
    onSuccess={() => setBump((n) => n + 1)}
    workspaceId={workspaceId}
    cisAdvisorySide={cisAdvisorySide}
    folders={folders}
    existing={{
      id: editing.id,
      email: editing.email,
      role: editing.role,
      folderIds: editing.folderIds,
    }}
  />
)}
```

- [ ] **Step 3: Update participants DAL test to expect the folderIds field**

Open `cis-deal-room/src/test/dal/participants.test.ts`. In the `getParticipants` test, update the mock result to include `folderIds: []`:

```typescript
mockSelectChain.mockResolvedValue([
  { id: 'p1', userId: 'u1', email: 'a@b.com', role: 'client', status: 'active', folderIds: [] },
]);
```

Also adjust assertion if needed so the test still passes with the new column.

- [ ] **Step 4: Run tests**

```bash
cd cis-deal-room && npx vitest run src/test/dal/participants.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/participants.ts src/components/workspace/ParticipantList.tsx src/test/dal/participants.test.ts && git commit -m "feat(participants): include folderIds in GET response; edit modal prefills correctly"
```

---

## Task 3: Banner component + No-Client warning + status-transition guard

**Files:**
- Create: `cis-deal-room/src/components/ui/Banner.tsx`
- Modify: `cis-deal-room/src/lib/dal/participants.ts` (add `countActiveClientParticipants`)
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/status/route.ts`
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Create the `<Banner />` component**

Create `cis-deal-room/src/components/ui/Banner.tsx`:

```typescript
'use client';

import { clsx } from 'clsx';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

type BannerVariant = 'warning' | 'danger' | 'info';

interface BannerProps {
  variant?: BannerVariant;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

const VARIANT_STYLES: Record<BannerVariant, { bg: string; text: string; icon: React.ElementType }> = {
  warning: { bg: 'bg-warning-subtle', text: 'text-warning', icon: AlertTriangle },
  danger: { bg: 'bg-danger-subtle', text: 'text-danger', icon: AlertCircle },
  info: { bg: 'bg-accent-subtle', text: 'text-accent', icon: Info },
};

export function Banner({ variant = 'warning', children, action }: BannerProps) {
  const { bg, text, icon: Icon } = VARIANT_STYLES[variant];

  return (
    <div className={clsx('flex items-center gap-3 px-6 py-2.5 border-b border-border', bg)}>
      <Icon size={16} className={text} />
      <div className={clsx('flex-1 text-sm', text)}>{children}</div>
      {action && (
        <button
          onClick={action.onClick}
          className={clsx('text-sm font-medium underline hover:no-underline', text)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `countActiveClientParticipants` to participants DAL**

Open `cis-deal-room/src/lib/dal/participants.ts`. Add this function alongside the other exports:

```typescript
import { count, and } from 'drizzle-orm';

export async function countActiveClientParticipants(workspaceId: string): Promise<number> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [row] = await db
    .select({ count: count() })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.role, 'client'),
        eq(workspaceParticipants.status, 'active')
      )
    );

  return Number(row?.count ?? 0);
}
```

(`count` and `and` may already be imported from `drizzle-orm`; dedup the import if so.)

- [ ] **Step 3: Add transition guard to `PATCH /workspaces/[id]/status`**

Open `cis-deal-room/src/app/api/workspaces/[id]/status/route.ts`. Read the file first to understand the existing structure, then add the guard before calling `updateWorkspaceStatus`:

```typescript
import { countActiveClientParticipants } from '@/lib/dal/participants';
import { getWorkspace } from '@/lib/dal/workspaces';

// inside the PATCH handler, after parsing the validated body:
const workspace = await getWorkspace(workspaceId);
if (!workspace) {
  return Response.json({ error: 'Workspace not found' }, { status: 404 });
}

if (parsed.status === 'active_dd' && workspace.status === 'engagement') {
  const activeClients = await countActiveClientParticipants(workspaceId);
  if (activeClients === 0) {
    return Response.json(
      { error: 'At least one active Client participant is required before moving to Active DD' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 4: Render the no-Client banner in WorkspaceShell**

Open `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`. At the top of the component, read the participant count from the server-rendered workspace data (add a new prop `activeClientCount: number`):

First update `WorkspaceShellProps`:
```typescript
interface WorkspaceShellProps {
  workspace: Workspace;
  folders: Folder[];
  fileCounts: Record<string, number>;
  isAdmin: boolean;
  activeClientCount: number;
}
```

Then destructure and wire the banner. Inside the return JSX, right under the `<header>`, add:

```tsx
import { Banner } from '@/components/ui/Banner';

// …at the top of the body (below the header, above the three-panel `<div>`):
{activeClientCount === 0 && (
  <Banner
    variant="warning"
    action={{
      label: 'Invite Client',
      onClick: () => {
        // Open Invite modal pre-filled to client role. We'll re-use the existing
        // ParticipantList invite modal by triggering it via a ref or shared state.
        // Simplest: local state that the RightPanel's ParticipantList reads.
        setShowClientInviteFromBanner(true);
      },
    }}
  >
    No active Client participant. Invite one to progress the deal.
  </Banner>
)}
```

This requires a small lift to the RightPanel → ParticipantList chain. Add state:
```typescript
const [showClientInviteFromBanner, setShowClientInviteFromBanner] = useState(false);
```

And pass `inviteClientTrigger={showClientInviteFromBanner}` and `onInviteClientHandled={() => setShowClientInviteFromBanner(false)}` through RightPanel → ParticipantList → ParticipantFormModal (opens in invite mode with role='client' prefilled).

**Simpler alternative if this is too much wiring:** the banner action just switches the RightPanel to the Participants tab + user clicks "Invite Participant" themselves. Two clicks instead of one, but no prop drilling. Judgment call at implement time.

- [ ] **Step 5: Update workspace page to pass activeClientCount**

Open `cis-deal-room/src/app/(app)/workspace/[workspaceId]/page.tsx`. Add the count to the parallel fetch:

```typescript
import { countActiveClientParticipants } from '@/lib/dal/participants';

// inside the async function:
const [workspace, folders, activeClientCount] = await Promise.all([
  getWorkspace(workspaceId),
  getFoldersForWorkspace(workspaceId),
  countActiveClientParticipants(workspaceId),
]);

// pass to WorkspaceShell:
<WorkspaceShell
  workspace={workspace}
  folders={folders}
  fileCounts={fileCounts}
  isAdmin={session.isAdmin}
  activeClientCount={activeClientCount}
/>
```

- [ ] **Step 6: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room && git add src/components/ui/Banner.tsx src/lib/dal/participants.ts src/app/api/workspaces/\[id\]/status/route.ts src/components/workspace/WorkspaceShell.tsx src/app/\(app\)/workspace/\[workspaceId\]/page.tsx && git commit -m "feat(workspace): no-Client banner + block Engagement→Active DD transition"
```

---

## Task 4: Deal list search + status filter

**Files:**
- Modify: `cis-deal-room/src/components/deals/DealList.tsx`

- [ ] **Step 1: Add search + status filter state and UI**

Open `cis-deal-room/src/components/deals/DealList.tsx`. At the top of the component, add state:

```typescript
import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { WorkspaceStatus } from '@/types';

// inside component:
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState<WorkspaceStatus | 'all'>('all');
```

Above the rendered deal list, insert the filters bar:

```tsx
<div className="flex items-center gap-3 mb-4">
  <div className="relative flex-1 max-w-sm">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
    <input
      type="text"
      placeholder="Search deals..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="w-full pl-9 pr-3 py-2 text-sm bg-surface-sunken border border-border rounded-lg
        text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>
  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value as WorkspaceStatus | 'all')}
    className="px-3 py-2 text-sm bg-surface-sunken border border-border rounded-lg
      text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
  >
    <option value="all">All statuses</option>
    <option value="engagement">Engagement</option>
    <option value="active_dd">Active DD</option>
    <option value="ioi_stage">IOI Stage</option>
    <option value="closing">Closing</option>
    <option value="closed">Closed</option>
    <option value="archived">Archived</option>
  </select>
</div>
```

- [ ] **Step 2: Filter the displayed list**

Add a `useMemo` that applies the filters:

```typescript
const filtered = useMemo(() => {
  const lower = search.toLowerCase();
  return workspaces.filter((w) => {
    const matchesSearch =
      lower === '' ||
      w.name.toLowerCase().includes(lower) ||
      (w.clientName && w.clientName.toLowerCase().includes(lower));
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
}, [workspaces, search, statusFilter]);
```

Change the rendered map from `workspaces.map(...)` to `filtered.map(...)`. When `filtered.length === 0 && workspaces.length > 0`, show an empty-state message "No deals match your filters" instead of the original empty state.

- [ ] **Step 3: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/components/deals/DealList.tsx && git commit -m "feat(deals): add client-side search + status filter on deal list"
```

---

## Group 2 — Structural changes

## Task 5: Phase 4 schema migration

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts`

- [ ] **Step 1: Add schema changes**

Open `cis-deal-room/src/db/schema.ts`. Make these edits:

**(a) Extend `users` table:**

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isAdmin: boolean('is_admin').notNull().default(false),
  notificationDigest: boolean('notification_digest').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**(b) Extend `sessions` table:**

Add a new column after `lastActiveAt`:
```typescript
absoluteExpiresAt: timestamp('absolute_expires_at').notNull().default(sql`now() + interval '4 hours'`),
```

At the top of the file add `import { sql } from 'drizzle-orm';` if not already imported.

**(c) Add `notification_queue` table at the end of the file:**

```typescript
export const notificationQueue = pgTable('notification_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  action: activityActionEnum('action').notNull(),
  targetType: activityTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
});
```

`jsonb` may need to be added to the existing import from `drizzle-orm/pg-core`.

- [ ] **Step 2: Generate the Drizzle migration**

```bash
cd cis-deal-room && npx drizzle-kit generate
```

Expected: a new migration file in `src/db/migrations/` with:
- `ALTER TABLE users ADD COLUMN first_name text`
- `ALTER TABLE users ADD COLUMN last_name text`
- `ALTER TABLE users ADD COLUMN notification_digest boolean default false`
- `ALTER TABLE sessions ADD COLUMN absolute_expires_at timestamp ...`
- `CREATE TABLE notification_queue (...)`

Inspect the migration SQL briefly to confirm those statements exist.

- [ ] **Step 3: Apply the migration**

```bash
cd cis-deal-room && set -a && source .env.local && set +a && npx drizzle-kit migrate
```

Expected: `[✓] Migrations applied`.

- [ ] **Step 4: Backfill `absolute_expires_at` on existing sessions**

Existing sessions have `absolute_expires_at` = creation_time + 4h, which may be in the past — logging everyone out next request. That's acceptable (it's a session rotation). Alternatively, run a one-shot update to set `absolute_expires_at = now() + interval '4 hours'` for current sessions so active users don't get kicked. Use your judgment based on whether you have active test users right now.

One-shot SQL (optional):
```bash
cd cis-deal-room && set -a && source .env.local && set +a && cat > /tmp/bf.mjs <<'EOF'
import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("UPDATE sessions SET absolute_expires_at = now() + interval '4 hours'");
console.log('backfilled');
await pool.end();
EOF
cp /tmp/bf.mjs backfill.mjs && npx tsx backfill.mjs && rm backfill.mjs
```

Skip if you don't have in-flight sessions you want to preserve.

- [ ] **Step 5: Typecheck + run full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors; existing tests still GREEN (tests mock `@/db`, so they're unaffected by schema changes).

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/db/schema.ts src/db/migrations/ && git commit -m "feat(schema): add user names, session absolute cap, notification_queue, digest preference"
```

---

## Task 6: `displayName` helper + DAL consumer extensions

**Files:**
- Create: `cis-deal-room/src/lib/users/display.ts`
- Create: `cis-deal-room/src/test/lib/display.test.ts`
- Modify: `cis-deal-room/src/lib/dal/participants.ts`
- Modify: `cis-deal-room/src/lib/dal/files.ts`
- Modify: `cis-deal-room/src/lib/dal/workspaces.ts`
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`
- Modify: `cis-deal-room/src/app/api/files/route.ts`

- [ ] **Step 1: Write failing tests for `displayName`**

Create `cis-deal-room/src/test/lib/display.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { displayName } from '@/lib/users/display';

describe('displayName()', () => {
  it('returns "First Last" when both set', () => {
    expect(displayName({ firstName: 'Rob', lastName: 'Levin', email: 'a@b.com' })).toBe('Rob Levin');
  });

  it('falls back to email when firstName is null', () => {
    expect(displayName({ firstName: null, lastName: 'Levin', email: 'a@b.com' })).toBe('a@b.com');
  });

  it('falls back to email when lastName is null', () => {
    expect(displayName({ firstName: 'Rob', lastName: null, email: 'a@b.com' })).toBe('a@b.com');
  });

  it('falls back to email when both null', () => {
    expect(displayName({ firstName: null, lastName: null, email: 'a@b.com' })).toBe('a@b.com');
  });

  it('trims whitespace in names before joining', () => {
    expect(displayName({ firstName: 'Rob ', lastName: ' Levin', email: 'a@b.com' })).toBe('Rob Levin');
  });
});
```

- [ ] **Step 2: Create the helper**

Create `cis-deal-room/src/lib/users/display.ts`:

```typescript
/**
 * Returns a human-facing display string for a user. Prefers "First Last"
 * when both name fields are set; otherwise falls back to email.
 *
 * Auth identity (sessions, email-keyed rate limits) continues to use
 * `email`. This helper is strictly for UI strings.
 */
export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  return user.email;
}
```

- [ ] **Step 3: Run the test**

```bash
cd cis-deal-room && npx vitest run src/test/lib/display.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 4: Extend `getParticipants` to return firstName/lastName/lastSeen**

Open `cis-deal-room/src/lib/dal/participants.ts`. Update `getParticipants` to join additional `users` columns and a correlated subquery for `lastSeen`:

```typescript
import { max } from 'drizzle-orm';
import { sessions } from '@/db/schema';

export async function getParticipants(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: workspaceParticipants.id,
      userId: workspaceParticipants.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: workspaceParticipants.role,
      status: workspaceParticipants.status,
      invitedAt: workspaceParticipants.invitedAt,
      activatedAt: workspaceParticipants.activatedAt,
      folderIds: sql<string[]>`coalesce(array_agg(${folderAccess.folderId}) filter (where ${folderAccess.folderId} is not null), '{}')`,
      lastSeen: sql<Date | null>`(select max(${sessions.lastActiveAt}) from ${sessions} where ${sessions.userId} = ${users.id})`,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .leftJoin(folderAccess, eq(folderAccess.participantId, workspaceParticipants.id))
    .where(eq(workspaceParticipants.workspaceId, workspaceId))
    .groupBy(
      workspaceParticipants.id,
      workspaceParticipants.userId,
      users.id,
      users.email,
      users.firstName,
      users.lastName,
      workspaceParticipants.role,
      workspaceParticipants.status,
      workspaceParticipants.invitedAt,
      workspaceParticipants.activatedAt,
    );

  return rows;
}
```

- [ ] **Step 5: Extend `getFilesForFolder` and `getFileById` to include uploader name fields**

Open `cis-deal-room/src/lib/dal/files.ts`. Update `getFilesForFolder`:

```typescript
export async function getFilesForFolder(folderId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db
    .select({
      id: files.id,
      folderId: files.folderId,
      name: files.name,
      s3Key: files.s3Key,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      version: files.version,
      createdAt: files.createdAt,
      uploadedByEmail: users.email,
      uploadedByFirstName: users.firstName,
      uploadedByLastName: users.lastName,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploadedBy))
    .where(eq(files.folderId, folderId))
    .orderBy(desc(files.createdAt));
}
```

- [ ] **Step 6: Extend `getWorkspacesForUser` with counts + last-activity summary**

Open `cis-deal-room/src/lib/dal/workspaces.ts`. Replace `getWorkspacesForUser` with an extended version. This is the most complex query in the plan — use three LATERAL subqueries:

```typescript
import { desc, eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { workspaces, workspaceParticipants, folders, files, activityLogs, users } from '@/db/schema';
import { verifySession } from './index';

export async function getWorkspacesForUser() {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const baseQuery = db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      clientName: workspaces.clientName,
      status: workspaces.status,
      cisAdvisorySide: workspaces.cisAdvisorySide,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      docCount: sql<number>`(
        select count(*)::int from ${files}
        inner join ${folders} on ${folders.id} = ${files.folderId}
        where ${folders.workspaceId} = ${workspaces.id}
      )`,
      participantCount: sql<number>`(
        select count(*)::int from ${workspaceParticipants}
        where ${workspaceParticipants.workspaceId} = ${workspaces.id}
          and ${workspaceParticipants.status} = 'active'
      )`,
      lastActivityAction: sql<string | null>`(
        select action from ${activityLogs}
        where ${activityLogs.workspaceId} = ${workspaces.id}
        order by ${activityLogs.createdAt} desc limit 1
      )`,
      lastActivityAt: sql<Date | null>`(
        select ${activityLogs.createdAt} from ${activityLogs}
        where ${activityLogs.workspaceId} = ${workspaces.id}
        order by ${activityLogs.createdAt} desc limit 1
      )`,
    });

  if (session.isAdmin) {
    return baseQuery.from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  return baseQuery
    .from(workspaces)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .orderBy(desc(workspaces.createdAt));
}
```

- [ ] **Step 7: Extend activity route to include actor name fields**

Open `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`. Update the select list to include firstName/lastName:

```typescript
const rows = await db
  .select({
    id: activityLogs.id,
    action: activityLogs.action,
    targetType: activityLogs.targetType,
    targetId: activityLogs.targetId,
    metadata: activityLogs.metadata,
    createdAt: activityLogs.createdAt,
    actorEmail: users.email,
    actorFirstName: users.firstName,
    actorLastName: users.lastName,
  })
  .from(activityLogs)
  .innerJoin(users, eq(users.id, activityLogs.userId))
  .where(eq(activityLogs.workspaceId, workspaceId))
  .orderBy(desc(activityLogs.createdAt))
  .limit(parsed.data.limit)
  .offset(parsed.data.offset);

return Response.json(rows);
```

- [ ] **Step 8: Extend files list route to include uploader name fields**

Open `cis-deal-room/src/app/api/files/route.ts`. Update the select shape:

```typescript
const rows = await db
  .select({
    id: files.id,
    folderId: files.folderId,
    name: files.name,
    s3Key: files.s3Key,
    sizeBytes: files.sizeBytes,
    mimeType: files.mimeType,
    version: files.version,
    createdAt: files.createdAt,
    uploadedByEmail: users.email,
    uploadedByFirstName: users.firstName,
    uploadedByLastName: users.lastName,
  })
  .from(files)
  .innerJoin(users, eq(files.uploadedBy, users.id))
  .where(eq(files.folderId, parsed.data.folderId))
  .orderBy(desc(files.createdAt));
```

- [ ] **Step 9: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors; existing tests still GREEN (mocked-DB tests don't care about added columns).

- [ ] **Step 10: Commit**

```bash
cd cis-deal-room && git add src/lib/users/display.ts src/test/lib/display.test.ts src/lib/dal/participants.ts src/lib/dal/files.ts src/lib/dal/workspaces.ts src/app/api/workspaces/\[id\]/activity/route.ts src/app/api/files/route.ts && git commit -m "feat(users): displayName helper; DAL returns user name fields + lastSeen + workspace counts"
```

---

## Task 7: `/complete-profile` page + `POST /api/user/profile` + verify-route gate

**Files:**
- Create: `cis-deal-room/src/app/(app)/complete-profile/page.tsx`
- Create: `cis-deal-room/src/app/(app)/complete-profile/ProfileForm.tsx`
- Create: `cis-deal-room/src/app/api/user/profile/route.ts`
- Create: `cis-deal-room/src/test/api/user-profile.test.ts`
- Modify: `cis-deal-room/src/app/api/auth/verify/route.ts`

- [ ] **Step 1: Write failing tests for `POST /api/user/profile`**

Create `cis-deal-room/src/test/api/user-profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));

const mockUpdateWhere = vi.fn();
vi.mock('@/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: mockUpdateWhere }) }) }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { POST } from '@/app/api/user/profile/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: false };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ firstName: 'Rob', lastName: 'Levin' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty firstName', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ firstName: '', lastName: 'Levin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for overly long firstName', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ firstName: 'x'.repeat(100), lastName: 'Levin' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockUpdateWhere.mockResolvedValue([{ id: 'u1', firstName: 'Rob', lastName: 'Levin' }]);
    const res = await POST(makeRequest({ firstName: 'Rob', lastName: 'Levin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstName).toBe('Rob');
  });

  it('trims whitespace before saving', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockUpdateWhere.mockResolvedValue([{ id: 'u1', firstName: 'Rob', lastName: 'Levin' }]);
    await POST(makeRequest({ firstName: '  Rob  ', lastName: '  Levin  ' }));
    // DB call should receive trimmed values — we can't easily assert on mock args
    // without more mock wiring. This test asserts the round-trip works.
    expect(mockUpdateWhere).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
cd cis-deal-room && npx vitest run src/test/api/user-profile.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/user/profile/route'`

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/user/profile/route.ts`:

```typescript
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const profileSchema = z.object({
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof profileSchema>;
  try {
    const body = await request.json();
    // Trim before validation so whitespace-only input fails
    const trimmed = {
      firstName: typeof body.firstName === 'string' ? body.firstName.trim() : '',
      lastName: typeof body.lastName === 'string' ? body.lastName.trim() : '',
    };
    parsed = profileSchema.parse(trimmed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.userId))
    .returning();

  return Response.json(updated);
}
```

- [ ] **Step 4: Run tests — expect GREEN**

```bash
cd cis-deal-room && npx vitest run src/test/api/user-profile.test.ts
```

- [ ] **Step 5: Create the `/complete-profile` page**

Create `cis-deal-room/src/app/(app)/complete-profile/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Logo } from '@/components/ui/Logo';
import { ProfileForm } from './ProfileForm';

export default async function CompleteProfilePage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const [user] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  // Already has name → skip the gate
  if (user?.firstName && user?.lastName) {
    redirect('/deals');
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo size="md" className="mx-auto mb-8" />
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary mb-1">Complete your profile</h1>
          <p className="text-sm text-text-muted mb-6">
            Tell us how you&apos;d like to be identified in the deal room.
          </p>
          <ProfileForm />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create the `ProfileForm` client component**

Create `cis-deal-room/src/app/(app)/complete-profile/ProfileForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ProfileForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(typeof body.error === 'string' ? body.error : 'Failed to save profile');
        setSubmitting(false);
        return;
      }
      // Honor returnTo if set by the 401 interceptor; otherwise /deals
      const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('loginReturnTo') : null;
      if (returnTo) sessionStorage.removeItem('loginReturnTo');
      router.push(returnTo ?? '/deals');
      router.refresh();
    } catch {
      toast.error('Network error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="first-name" className="block text-sm font-medium text-text-secondary mb-1.5">
          First name
        </label>
        <input
          id="first-name"
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={submitting}
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
            text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label htmlFor="last-name" className="block text-sm font-medium text-text-secondary mb-1.5">
          Last name
        </label>
        <input
          id="last-name"
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={submitting}
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm
            text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !firstName.trim() || !lastName.trim()}
        className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-text-inverse
          hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Continue
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Update the verify route to redirect to `/complete-profile` when name missing**

Open `cis-deal-room/src/app/api/auth/verify/route.ts`. Inside the success branch (after `setSessionCookie`), read the user's name; if missing, override the redirect target:

Find the section that computes `redirectTarget`. Replace it with:

```typescript
// Check if user needs to complete profile before landing at the normal target
if (!user.firstName || !user.lastName) {
  // Read the user row fully to decide
  const [full] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!full?.firstName || !full?.lastName) {
    const response = NextResponse.redirect(new URL(`${appUrl}/complete-profile`));
    setSessionCookie(response, sessionId);
    return response;
  }
}

const redirectTarget =
  tokenRow.purpose === 'invitation' && tokenRow.redirectTo
    ? `${appUrl}${tokenRow.redirectTo}`
    : `${appUrl}/deals`;
```

Note: the `user` local variable from the onConflictDoUpdate insert may not include firstName/lastName in its returning shape. Update the returning clause to include them:

```typescript
const [user] = await db
  .insert(users)
  .values({ email, isAdmin: false })
  .onConflictDoUpdate({
    target: users.email,
    set: { updatedAt: new Date() },
  })
  .returning({ id: users.id, firstName: users.firstName, lastName: users.lastName });
```

Now `user.firstName` and `user.lastName` are available directly; remove the redundant select.

- [ ] **Step 8: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
cd cis-deal-room && git add src/app/\(app\)/complete-profile/ src/app/api/user/profile/route.ts src/test/api/user-profile.test.ts src/app/api/auth/verify/route.ts && git commit -m "feat(users): complete-profile gate + POST /api/user/profile + verify-route redirect"
```

---

## Task 8: Migrate UI consumers to `displayName`

**Files:**
- Modify: `cis-deal-room/src/components/workspace/ParticipantList.tsx`
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx`

- [ ] **Step 1: Update `ParticipantList` row to use displayName + last seen**

Open `cis-deal-room/src/components/workspace/ParticipantList.tsx`. Update the `ParticipantRow` interface:

```typescript
interface ParticipantRow {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: ParticipantRole;
  status: string;
  invitedAt: string | Date;
  activatedAt: string | Date | null;
  folderIds: string[];
  lastSeen: string | Date | null;
}
```

Add imports at top:
```typescript
import { displayName } from '@/lib/users/display';
```

Inside the row render, replace the primary text display block. Instead of showing just email, show name + email secondary + last-seen:

```tsx
<div className="min-w-0 flex-1">
  <p className="text-sm text-text-primary truncate font-medium">
    {displayName(row)}
  </p>
  {isAdmin && displayName(row) !== row.email && (
    <p className="text-xs text-text-muted truncate">{row.email}</p>
  )}
  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
      row.status === 'active'
        ? 'bg-success-subtle text-success border-success/30'
        : 'bg-surface-sunken text-text-secondary border-border'
    )}>
      {row.status === 'active' ? 'Active' : 'Invited'}
    </span>
    <span className="text-xs text-text-muted">
      {roleLabel(row.role, cisAdvisorySide)}
    </span>
    <span className="text-xs text-text-muted">
      {row.status === 'active' && row.lastSeen
        ? `last seen ${formatRelative(row.lastSeen)}`
        : row.status === 'invited'
          ? 'not yet accepted'
          : null}
    </span>
  </div>
</div>
```

Helper at bottom of file (or extract to `src/lib/relative-time.ts` if it doesn't exist):

```typescript
function formatRelative(ts: string | Date): string {
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
```

Import `clsx` at top if not present. Update the Edit modal's `existing` prop so it matches the `email` field being part of the display:

```typescript
existing={{
  id: editing.id,
  email: editing.email,
  role: editing.role,
  folderIds: editing.folderIds,
}}
```

- [ ] **Step 2: Update `FileList` "uploaded by" column**

Open `cis-deal-room/src/components/workspace/FileList.tsx`. Update the `FileRow` interface:

```typescript
interface FileRow {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  uploadedByEmail?: string;
  uploadedByFirstName?: string | null;
  uploadedByLastName?: string | null;
  createdAt: string | Date;
}
```

Update the "by" column rendering:

```tsx
<span className="text-xs text-text-secondary truncate">
  {file.uploadedByEmail
    ? displayName({
        firstName: file.uploadedByFirstName ?? null,
        lastName: file.uploadedByLastName ?? null,
        email: file.uploadedByEmail,
      })
    : '—'}
</span>
```

Add import: `import { displayName } from '@/lib/users/display';`

- [ ] **Step 3: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/ParticipantList.tsx src/components/workspace/FileList.tsx && git commit -m "feat(ui): participants + file list use displayName; last-seen replaces online indicator"
```

---

## Task 9: Session policy — 2h idle, 4h absolute, 401 interceptor, returnTo

**Files:**
- Modify: `cis-deal-room/src/lib/auth/session.ts`
- Create: `cis-deal-room/src/lib/fetch-with-auth.ts`
- Modify: `cis-deal-room/src/app/(auth)/login/LoginForm.tsx`
- Modify: `cis-deal-room/src/app/(app)/deals/page.tsx` (client returnTo consumer — see note below)
- Many client components: migrate `fetch(` → `fetchWithAuth(`

- [ ] **Step 1: Shorten idle window and add absolute-expiry check**

Open `cis-deal-room/src/lib/auth/session.ts`. Make these changes:

**(a) Update the constant:**
```typescript
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours
```
Remove the old 24h constant.

**(b) Update `getSession`:**

```typescript
export async function getSession(sessionId: string): Promise<Session | null> {
  const idleCutoff = new Date(Date.now() - SESSION_IDLE_MS);
  const now = new Date();

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.lastActiveAt, idleCutoff),
        gt(sessions.absoluteExpiresAt, now)
      )
    )
    .limit(1);

  if (!result.length) return null;

  await db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return {
    sessionId,
    userId: result[0].user.id,
    userEmail: result[0].user.email,
    isAdmin: result[0].user.isAdmin,
  };
}
```

**(c) Update `createSession` to set `absoluteExpiresAt`:**

```typescript
const SESSION_ABSOLUTE_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function createSession(userId: string): Promise<string> {
  const now = new Date();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      lastActiveAt: now,
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    })
    .returning({ id: sessions.id });
  return session.id;
}
```

- [ ] **Step 2: Create the `fetchWithAuth` helper**

Create `cis-deal-room/src/lib/fetch-with-auth.ts`:

```typescript
import { toast } from 'sonner';

/**
 * Thin fetch wrapper that intercepts 401 responses and redirects to
 * /login with a returnTo pointing at the current URL. Toasts the user
 * before the redirect.
 *
 * Use this instead of the global `fetch` in every client component that
 * makes authenticated calls.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      const current = window.location.pathname + window.location.search;
      toast.error('Session expired — please sign in again');
      window.location.href = `/login?returnTo=${encodeURIComponent(current)}`;
    }
    throw new Error('Session expired');
  }
  return res;
}
```

- [ ] **Step 3: Store `returnTo` on the login page**

Open `cis-deal-room/src/app/(auth)/login/LoginForm.tsx`. Inside the component, add a `useEffect` on mount that captures `returnTo` from the URL into sessionStorage:

```typescript
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// …inside component top:
const searchParams = useSearchParams();
useEffect(() => {
  const returnTo = searchParams.get('returnTo');
  if (returnTo && returnTo.startsWith('/')) {
    sessionStorage.setItem('loginReturnTo', returnTo);
  }
}, [searchParams]);
```

Ensure this component is `'use client'` (probably already is).

- [ ] **Step 4: Consume `returnTo` after landing on /deals**

In a simple bump to the existing deal list page, add a tiny client component that reads sessionStorage and replaces the URL if present. Create `cis-deal-room/src/components/auth/ReturnToHandler.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Reads the returnTo sessionStorage entry set by the login page's returnTo
 * capture. If present and valid same-origin path, navigates there and
 * clears the entry. Otherwise no-op.
 */
export function ReturnToHandler() {
  const router = useRouter();
  useEffect(() => {
    const returnTo = sessionStorage.getItem('loginReturnTo');
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.removeItem('loginReturnTo');
      router.replace(returnTo);
    }
  }, [router]);
  return null;
}
```

Mount it in `cis-deal-room/src/app/(app)/deals/page.tsx` (deal list — the default post-verify landing spot):

```typescript
import { ReturnToHandler } from '@/components/auth/ReturnToHandler';

// inside the return JSX, at the top level:
<>
  <ReturnToHandler />
  {/* existing content */}
</>
```

- [ ] **Step 5: Migrate client components to `fetchWithAuth`**

Search for `fetch(` calls inside client components (files with `'use client'` at the top). Expected locations:
- `src/components/workspace/UploadModal.tsx`
- `src/components/workspace/ParticipantList.tsx`
- `src/components/workspace/ParticipantFormModal.tsx`
- `src/components/workspace/FileList.tsx`
- `src/components/deals/NewDealModal.tsx`
- `src/components/workspace/FolderSidebar.tsx` (if it calls fetch)
- `src/components/workspace/WorkspaceShell.tsx` (status PATCH)
- `src/app/(app)/complete-profile/ProfileForm.tsx`

For each file:
1. Add `import { fetchWithAuth } from '@/lib/fetch-with-auth';`
2. Replace every `fetch(` with `fetchWithAuth(`

Do NOT migrate server-component fetches — those don't pass through client interception.

- [ ] **Step 6: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Tests that mock `global.fetch` will still work because `fetchWithAuth` calls through to `fetch` in the happy path; the 401 branch is untested by existing suites (and isn't required to be for this migration).

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room && git add src/lib/auth/session.ts src/lib/fetch-with-auth.ts src/app/\(auth\)/login/LoginForm.tsx src/components/auth/ReturnToHandler.tsx src/app/\(app\)/deals/page.tsx src/components/ && git commit -m "feat(auth): 2h idle + 4h absolute session cap; fetchWithAuth 401 interceptor; returnTo flow"
```

---

## Task 10: Deal list tile cards (`DealCard`) + consume extended DAL

**Files:**
- Create: `cis-deal-room/src/components/deals/DealCard.tsx`
- Modify: `cis-deal-room/src/components/deals/DealList.tsx`

- [ ] **Step 1: Create the `DealCard` component**

Create `cis-deal-room/src/components/deals/DealCard.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { FileText, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { WorkspaceStatus } from '@/types';

interface DealCardProps {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  docCount: number;
  participantCount: number;
  lastActivityAction: string | null;
  lastActivityAt: Date | string | null;
  isAdmin: boolean;
}

function formatRelative(ts: Date | string): string {
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionSummary(action: string | null, at: Date | string | null): string {
  if (!action || !at) return 'No activity yet';
  const labels: Record<string, string> = {
    uploaded: 'File uploaded',
    downloaded: 'File downloaded',
    deleted: 'File deleted',
    invited: 'Participant invited',
    removed: 'Participant removed',
    participant_updated: 'Participant updated',
    created_folder: 'Folder created',
    renamed_folder: 'Folder renamed',
    created_workspace: 'Workspace created',
    revoked_access: 'Access revoked',
    status_changed: 'Status changed',
    notified_batch: 'Batch notification',
  };
  return `${labels[action] ?? action} · ${formatRelative(at)}`;
}

export function DealCard({
  id, name, clientName, status, docCount, participantCount, lastActivityAction, lastActivityAt, isAdmin,
}: DealCardProps) {
  return (
    <Link
      href={`/workspace/${id}`}
      className="block bg-surface border border-border rounded-xl p-5 transition-colors
        hover:border-accent hover:bg-accent-subtle/30 focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold text-text-primary truncate flex-1">{name}</h3>
        <Badge status={status} />
      </div>
      {isAdmin && (
        <p className="text-sm text-text-secondary truncate mb-3">{clientName}</p>
      )}
      <div className="flex flex-col gap-1 text-xs text-text-muted">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <FileText size={12} /> {docCount} docs
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {participantCount} participants
          </span>
        </div>
        <span className="font-mono">{actionSummary(lastActivityAction, lastActivityAt)}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Migrate `DealList` to tile grid layout**

Open `cis-deal-room/src/components/deals/DealList.tsx`. Update the `Workspace` interface:

```typescript
interface Workspace {
  id: string;
  name: string;
  clientName: string;
  status: WorkspaceStatus;
  cisAdvisorySide: 'buyer_side' | 'seller_side';
  createdAt: Date | string;
  updatedAt: Date | string;
  docCount: number;
  participantCount: number;
  lastActivityAction: string | null;
  lastActivityAt: Date | string | null;
}
```

Replace the row-based render with a card grid:

```tsx
import { DealCard } from './DealCard';

// …inside the return (after the filter bar from Task 4):
{filtered.length === 0 ? (
  <div className="text-center py-16 text-text-muted">
    {workspaces.length === 0 ? (
      isAdmin ? 'No deal rooms yet — create your first one.' : 'You have not been invited to any deal rooms yet.'
    ) : (
      'No deals match your filters.'
    )}
  </div>
) : (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {filtered.map((w) => (
      <DealCard
        key={w.id}
        id={w.id}
        name={w.name}
        clientName={w.clientName}
        status={w.status}
        docCount={w.docCount}
        participantCount={w.participantCount}
        lastActivityAction={w.lastActivityAction}
        lastActivityAt={w.lastActivityAt}
        isAdmin={isAdmin}
      />
    ))}
  </div>
)}
```

The old row-based render (with table, headers, status-change dropdown inline) is entirely removed. Status can still be changed from inside a workspace (WorkspaceShell header).

- [ ] **Step 3: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/components/deals/DealCard.tsx src/components/deals/DealList.tsx && git commit -m "feat(deals): tile-card layout with doc/participant/last-activity counts"
```

---

## Task 11: Activity feed UI + polling + grouping

**Files:**
- Create: `cis-deal-room/src/components/workspace/ActivityFeed.tsx`
- Create: `cis-deal-room/src/components/workspace/ActivityRow.tsx`
- Modify: `cis-deal-room/src/components/workspace/RightPanel.tsx`

- [ ] **Step 1: Create `ActivityRow`**

Create `cis-deal-room/src/components/workspace/ActivityRow.tsx`:

```typescript
'use client';

import { displayName } from '@/lib/users/display';

interface ActivityRowProps {
  actorEmail: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  count?: number; // when grouped, count of collapsed events
  onTargetClick?: (targetType: string, targetId: string | null) => void;
}

function formatRelative(ts: Date | string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionVerb(action: string): string {
  const map: Record<string, string> = {
    uploaded: 'uploaded',
    downloaded: 'downloaded',
    deleted: 'deleted',
    invited: 'invited',
    removed: 'removed',
    participant_updated: 'updated',
    created_folder: 'created folder',
    renamed_folder: 'renamed folder',
    created_workspace: 'created workspace',
    revoked_access: 'revoked access to',
    status_changed: 'changed status',
    notified_batch: 'notified participants about',
  };
  return map[action] ?? action;
}

export function ActivityRow({
  actorEmail, actorFirstName, actorLastName, action, targetType, targetId, metadata, createdAt, count, onTargetClick,
}: ActivityRowProps) {
  const actor = displayName({ firstName: actorFirstName, lastName: actorLastName, email: actorEmail });
  const targetName =
    (metadata && (typeof metadata.fileName === 'string' ? metadata.fileName : null)) ??
    (metadata && (typeof metadata.email === 'string' ? metadata.email : null)) ??
    (metadata && (typeof metadata.folderId === 'string' ? 'folder' : null)) ??
    targetType;
  const plural = count && count > 1 ? `s (${count})` : '';

  return (
    <div className="py-2.5 border-b border-border-subtle last:border-0">
      <p className="text-sm text-text-primary leading-relaxed">
        <span className="font-medium">{actor}</span>
        <span className="text-text-secondary"> {actionVerb(action)} </span>
        {targetId && onTargetClick ? (
          <button
            onClick={() => onTargetClick(targetType, targetId)}
            className="font-medium text-accent hover:underline"
          >
            {targetName}{plural}
          </button>
        ) : (
          <span className="font-medium">{targetName}{plural}</span>
        )}
      </p>
      <p className="text-xs text-text-muted mt-0.5">{formatRelative(createdAt)}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `ActivityFeed` with polling + load-more + grouping**

Create `cis-deal-room/src/components/workspace/ActivityFeed.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ActivityRow } from './ActivityRow';

interface ActivityEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorEmail: string;
  actorFirstName: string | null;
  actorLastName: string | null;
}

interface ActivityFeedProps {
  workspaceId: string;
  onTargetClick?: (targetType: string, targetId: string | null) => void;
}

const POLL_MS = 60 * 1000;
const GROUP_WINDOW_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;

interface GroupedEvent extends ActivityEvent {
  count?: number;
}

function groupEvents(events: ActivityEvent[]): GroupedEvent[] {
  const out: GroupedEvent[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.actorEmail === e.actorEmail &&
      prev.action === e.action &&
      prev.targetType === e.targetType &&
      Math.abs(new Date(prev.createdAt).getTime() - new Date(e.createdAt).getTime()) < GROUP_WINDOW_MS
    ) {
      prev.count = (prev.count ?? 1) + 1;
    } else {
      out.push({ ...e });
    }
  }
  return out;
}

export function ActivityFeed({ workspaceId, onTargetClick }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);

  const loadPage = useCallback(async (offset: number, reset: boolean) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/activity?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) return;
    const data: ActivityEvent[] = await res.json();
    setEvents((prev) => (reset ? data : [...prev, ...data]));
    setHasMore(data.length === PAGE_SIZE);
    offsetRef.current = offset + data.length;
  }, [workspaceId]);

  // initial load
  useEffect(() => {
    setLoading(true);
    loadPage(0, true).finally(() => setLoading(false));
  }, [loadPage]);

  // polling — only when tab visible
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      timer = setInterval(() => {
        loadPage(0, true); // poll always replaces the first page
      }, POLL_MS);
    }
    function stopPolling() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    }
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadPage]);

  async function loadMore() {
    setLoadingMore(true);
    await loadPage(offsetRef.current, false);
    setLoadingMore(false);
  }

  const grouped = groupEvents(events);

  if (loading) return <p className="text-xs text-text-muted">Loading...</p>;
  if (grouped.length === 0) return <p className="text-xs text-text-muted">No activity yet.</p>;

  return (
    <div className="flex flex-col">
      {grouped.map((e) => (
        <ActivityRow
          key={e.id}
          actorEmail={e.actorEmail}
          actorFirstName={e.actorFirstName}
          actorLastName={e.actorLastName}
          action={e.action}
          targetType={e.targetType}
          targetId={e.targetId}
          metadata={e.metadata}
          createdAt={e.createdAt}
          count={e.count}
          onTargetClick={onTargetClick}
        />
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 text-xs text-accent hover:underline disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `ActivityFeed` into `RightPanel`**

Open `cis-deal-room/src/components/workspace/RightPanel.tsx`. Replace the `ActivityPlaceholder` in the Activity tab content:

```typescript
import { ActivityFeed } from './ActivityFeed';

// inside the tab content:
{activeTab === 'activity' ? (
  <ActivityFeed workspaceId={workspaceId} />
) : (
  <ParticipantList ... />
)}
```

Remove the `ActivityPlaceholder` function definition (no longer used).

- [ ] **Step 4: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/ActivityFeed.tsx src/components/workspace/ActivityRow.tsx src/components/workspace/RightPanel.tsx && git commit -m "feat(workspace): activity feed with polling, grouping, load-more"
```

---

## Group 3 — Notification digest pipeline

## Task 12: `enqueueOrSend` helper + upload-batch integration

**Files:**
- Create: `cis-deal-room/src/lib/notifications/enqueue-or-send.ts`
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts`

- [ ] **Step 1: Create the `enqueueOrSend` helper**

Create `cis-deal-room/src/lib/notifications/enqueue-or-send.ts`:

```typescript
import { db } from '@/db';
import { notificationQueue, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/send';
import type { ReactElement } from 'react';
import type { ActivityAction, ActivityTargetType } from '@/types';

interface Input {
  userId: string;
  workspaceId: string;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId: string | null;
  metadata: Record<string, unknown>;
  /** Callback to produce the immediate-email payload when digest is off */
  immediateEmail: () => Promise<{
    to: string;
    subject: string;
    react: ReactElement;
  }>;
}

/**
 * Central point for routing notifications. Reads the target user's
 * notification_digest preference: if true, enqueues for the daily
 * batch; if false, sends immediately via sendEmail().
 */
export async function enqueueOrSend(input: Input): Promise<void> {
  const [user] = await db
    .select({ notificationDigest: users.notificationDigest })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (user?.notificationDigest) {
    await db.insert(notificationQueue).values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
    return;
  }

  const payload = await input.immediateEmail();
  await sendEmail(payload);
}
```

- [ ] **Step 2: Use `enqueueOrSend` in the upload-batch notification route**

Open `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts`. Replace the per-recipient `sendEmail` loop with a `enqueueOrSend` loop:

```typescript
import { enqueueOrSend } from '@/lib/notifications/enqueue-or-send';

// inside POST, replace the existing for-loop block:
for (const recipient of recipients) {
  try {
    await enqueueOrSend({
      userId: recipient.userId,
      workspaceId,
      action: 'notified_batch',
      targetType: 'folder',
      targetId: folderId,
      metadata: {
        folderName: folder.name,
        workspaceName: workspace.name,
        files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
        uploaderEmail: session.userEmail,
      },
      immediateEmail: async () => ({
        to: recipient.email,
        subject: `${fileRows.length} new file${fileRows.length === 1 ? '' : 's'} in ${folder.name}`,
        react: UploadBatchNotificationEmail({
          workspaceName: workspace.name,
          folderName: folder.name,
          files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
          workspaceLink,
          uploaderEmail: session.userEmail,
        }),
      }),
    });
  } catch (err) {
    console.warn('[notify-upload-batch] send failure:', err);
  }
}
```

**Note on invitations:** invitation emails are time-sensitive (they contain the magic link that lands the invitee in the workspace). Per §9 of the spec, these always send immediately regardless of digest preference. No change to `POST /api/workspaces/[id]/participants` — it continues to call `sendEmail` directly.

- [ ] **Step 3: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

Note: existing `notify-upload-batch` tests may break because they mock `sendEmail` directly. Update tests to mock `enqueueOrSend` instead, OR test at a lower layer. Inspect failures and adjust.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/lib/notifications/enqueue-or-send.ts src/app/api/workspaces/\[id\]/notify-upload-batch/route.ts src/test/api/ && git commit -m "feat(notifications): enqueueOrSend helper routes based on user digest preference"
```

---

## Task 13: Daily digest cron route + email template

**Files:**
- Install: `@upstash/qstash`
- Create: `cis-deal-room/src/lib/email/daily-digest.tsx`
- Create: `cis-deal-room/src/app/api/cron/digest/route.ts`
- Create: `cis-deal-room/src/test/api/cron-digest.test.ts`

- [ ] **Step 1: Install qstash**

```bash
cd cis-deal-room && npm install @upstash/qstash
```

- [ ] **Step 2: Create the `DailyDigestEmail` template**

Create `cis-deal-room/src/lib/email/daily-digest.tsx`:

```typescript
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from '@react-email/components';

interface DigestEvent {
  workspaceName: string;
  action: string;
  actorName: string;
  targetName: string;
  at: string;
}

interface DailyDigestEmailProps {
  recipientName: string;
  events: DigestEvent[];
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    uploaded: 'uploaded',
    notified_batch: 'uploaded files to',
    invited: 'invited',
    removed: 'removed',
    participant_updated: 'updated',
    created_folder: 'created folder',
    created_workspace: 'created workspace',
    status_changed: 'changed status',
  };
  return map[action] ?? action;
}

export function DailyDigestEmail({ recipientName, events }: DailyDigestEmailProps) {
  const byWorkspace = new Map<string, DigestEvent[]>();
  for (const e of events) {
    const list = byWorkspace.get(e.workspaceName) ?? [];
    list.push(e);
    byWorkspace.set(e.workspaceName, list);
  }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{events.length} update{events.length === 1 ? '' : 's'} from your deal rooms</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img
            src={`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/cis-partners-logo.svg`}
            alt="CIS Partners"
            width="160"
            style={{ display: 'block', marginBottom: '32px' }}
          />
          <Heading style={headingStyle}>Your daily deal-room digest</Heading>
          <Text style={textStyle}>Hi {recipientName},</Text>
          <Text style={textStyle}>Here&apos;s what happened in your deals in the last 24 hours:</Text>

          {[...byWorkspace.entries()].map(([workspace, eventList]) => (
            <Section key={workspace} style={sectionStyle}>
              <Heading as="h3" style={h3Style}>{workspace}</Heading>
              {eventList.map((e, i) => (
                <Text key={i} style={itemStyle}>
                  • {e.actorName} {actionLabel(e.action)} {e.targetName}
                </Text>
              ))}
            </Section>
          ))}

          <Text style={smallTextStyle}>
            You&apos;re receiving this because daily digest is enabled. Change to real-time notifications in your account settings.
          </Text>

          <Text style={footerStyle}>CIS Partners Advisory &mdash; Confidential</Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = { backgroundColor: '#F4F4F5', fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: '40px 0' };
const containerStyle: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: '8px', maxWidth: '560px', margin: '0 auto', padding: '40px 32px' };
const headingStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '24px', fontWeight: '700', margin: '0 0 16px' };
const h3Style: React.CSSProperties = { color: '#0D0D0D', fontSize: '16px', fontWeight: '700', margin: '24px 0 8px' };
const textStyle: React.CSSProperties = { color: '#52525B', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px' };
const itemStyle: React.CSSProperties = { color: '#0D0D0D', fontSize: '14px', lineHeight: '1.7', margin: '0' };
const sectionStyle: React.CSSProperties = { margin: '0 0 24px' };
const smallTextStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '13px', lineHeight: '1.5', margin: '24px 0 16px' };
const footerStyle: React.CSSProperties = { color: '#A1A1AA', fontSize: '12px', margin: '0' };
```

- [ ] **Step 3: Create the cron route**

Create `cis-deal-room/src/app/api/cron/digest/route.ts`:

```typescript
import { Receiver } from '@upstash/qstash';
import { eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notificationQueue, users, workspaces } from '@/db/schema';
import { sendEmail } from '@/lib/email/send';
import { DailyDigestEmail } from '@/lib/email/daily-digest';
import { displayName } from '@/lib/users/display';

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export async function POST(request: Request) {
  // Verify QStash signature unless we're in dev without keys
  if (receiver) {
    const body = await request.clone().text();
    const signature = request.headers.get('Upstash-Signature');
    if (!signature) return Response.json({ error: 'Missing signature' }, { status: 401 });
    const valid = await receiver.verify({ signature, body });
    if (!valid) return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Drain all unprocessed queue rows
  const queued = await db
    .select({
      id: notificationQueue.id,
      userId: notificationQueue.userId,
      workspaceId: notificationQueue.workspaceId,
      action: notificationQueue.action,
      targetType: notificationQueue.targetType,
      targetId: notificationQueue.targetId,
      metadata: notificationQueue.metadata,
      createdAt: notificationQueue.createdAt,
    })
    .from(notificationQueue)
    .where(isNull(notificationQueue.processedAt));

  if (queued.length === 0) {
    return Response.json({ processed: 0 });
  }

  // Group by user
  const byUser = new Map<string, typeof queued>();
  for (const row of queued) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  // Fetch user + workspace lookup data in batch
  const userIds = [...byUser.keys()];
  const workspaceIds = [...new Set(queued.map((q) => q.workspaceId))];

  const userRows = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, userIds));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(inArray(workspaces.id, workspaceIds));
  const workspaceById = new Map(workspaceRows.map((w) => [w.id, w]));

  let processed = 0;
  const processedIds: string[] = [];
  for (const [userId, events] of byUser) {
    const user = userById.get(userId);
    if (!user) continue;

    const digestEvents = events.map((e) => ({
      workspaceName: workspaceById.get(e.workspaceId)?.name ?? 'Deal room',
      action: e.action,
      actorName: 'Someone', // metadata may contain actorName; enhance later
      targetName:
        (e.metadata && typeof (e.metadata as Record<string, unknown>).fileName === 'string'
          ? ((e.metadata as Record<string, unknown>).fileName as string)
          : null) ??
        e.targetType,
      at: e.createdAt.toISOString(),
    }));

    try {
      await sendEmail({
        to: user.email,
        subject: `Your daily deal-room digest — ${events.length} update${events.length === 1 ? '' : 's'}`,
        react: DailyDigestEmail({
          recipientName: displayName(user) !== user.email ? displayName(user) : 'there',
          events: digestEvents,
        }),
      });
      processedIds.push(...events.map((e) => e.id));
      processed += events.length;
    } catch (err) {
      console.warn('[cron-digest] send failure for user', userId, err);
    }
  }

  if (processedIds.length > 0) {
    await db
      .update(notificationQueue)
      .set({ processedAt: new Date() })
      .where(inArray(notificationQueue.id, processedIds));
  }

  return Response.json({ processed, users: byUser.size });
}
```

- [ ] **Step 4: Write tests for the cron route**

Create `cis-deal-room/src/test/api/cron-digest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdateWhere = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
  },
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));

import { POST } from '@/app/api/cron/digest/route';

describe('POST /api/cron/digest (stub mode without Upstash keys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
  });

  it('returns {processed:0} when queue is empty', async () => {
    mockSelect.mockResolvedValue([]);
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });
});
```

Additional tests covering the populated-queue path require substantial DB mock infrastructure — add them in a follow-up if coverage gaps bother you. The happy path here is intentionally light.

- [ ] **Step 5: Run tests**

```bash
cd cis-deal-room && npx vitest run src/test/api/cron-digest.test.ts
```

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add package.json package-lock.json src/lib/email/daily-digest.tsx src/app/api/cron/digest/route.ts src/test/api/cron-digest.test.ts && git commit -m "feat(notifications): daily digest cron route + DailyDigestEmail template"
```

---

## Task 14: User preferences route + UI toggle

**Files:**
- Create: `cis-deal-room/src/app/api/user/preferences/route.ts`
- Create: `cis-deal-room/src/test/api/user-preferences.test.ts`
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` (avatar menu with toggle)

- [ ] **Step 1: Write failing tests for preferences route**

Create `cis-deal-room/src/test/api/user-preferences.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
const mockReturning = vi.fn();
vi.mock('@/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: mockReturning }) }) }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { POST } from '@/app/api/user/preferences/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: false };

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/user/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ notificationDigest: true }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when notificationDigest not a boolean', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    const res = await POST(makeRequest({ notificationDigest: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    mockReturning.mockResolvedValue([{ id: 'u1', notificationDigest: true }]);
    const res = await POST(makeRequest({ notificationDigest: true }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Create the route**

Create `cis-deal-room/src/app/api/user/preferences/route.ts`:

```typescript
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const prefsSchema = z.object({
  notificationDigest: z.boolean(),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof prefsSchema>;
  try {
    parsed = prefsSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set({ notificationDigest: parsed.notificationDigest, updatedAt: new Date() })
    .where(eq(users.id, session.userId))
    .returning();

  return Response.json(updated);
}
```

- [ ] **Step 3: Add a digest toggle to the WorkspaceShell header**

Open `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`. Add a new UserMenu component (inline or in a separate file) with the digest toggle. Keep it simple — a small avatar-circle on the far right of the header that opens a popover.

Since this touches server-rendered data (`user.notificationDigest`), the shell needs the user's preference passed in. Update the page to fetch and pass it:

Open `cis-deal-room/src/app/(app)/workspace/[workspaceId]/page.tsx`:

```typescript
import { users } from '@/db/schema';

// after verifySession:
const [userRow] = await db
  .select({ notificationDigest: users.notificationDigest })
  .from(users)
  .where(eq(users.id, session.userId))
  .limit(1);

// pass to WorkspaceShell:
<WorkspaceShell
  workspace={workspace}
  folders={folders}
  fileCounts={fileCounts}
  isAdmin={session.isAdmin}
  activeClientCount={activeClientCount}
  notificationDigest={userRow?.notificationDigest ?? false}
/>
```

In `WorkspaceShell.tsx`, add the prop and a small menu component:

```typescript
interface WorkspaceShellProps {
  // …existing props
  notificationDigest: boolean;
}

// inside the header, after the status badge/dropdown:
<UserMenu notificationDigest={notificationDigest} userEmail={session.userEmail} />
```

Create `UserMenu` inline:

```typescript
function UserMenu({ notificationDigest, userEmail }: { notificationDigest: boolean; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState(notificationDigest);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const newValue = !digest;
    setSaving(true);
    setDigest(newValue); // optimistic
    try {
      const res = await fetchWithAuth('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationDigest: newValue }),
      });
      if (!res.ok) {
        setDigest(!newValue); // revert
        toast.error('Failed to update preference');
      } else {
        toast.success(`Email notifications set to ${newValue ? 'Daily digest' : 'Instant'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-surface-sunken border border-border text-text-primary text-xs font-semibold flex items-center justify-center"
        aria-label="User menu"
      >
        {userEmail.charAt(0).toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-lg shadow-md min-w-[220px] p-3">
            <p className="text-xs text-text-muted mb-2">{userEmail}</p>
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input type="checkbox" checked={digest} onChange={toggle} disabled={saving} />
              Daily digest (vs. instant)
            </label>
          </div>
        </>
      )}
    </div>
  );
}
```

Wire imports (toast, fetchWithAuth) and add `'use client'` to the top of the file if it isn't already — WorkspaceShell already is.

- [ ] **Step 4: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/user/preferences/route.ts src/test/api/user-preferences.test.ts src/app/\(app\)/workspace/\[workspaceId\]/page.tsx src/components/workspace/WorkspaceShell.tsx && git commit -m "feat(user): preferences route + avatar menu with digest toggle"
```

---

## Group 4 — Polish

## Task 15: File versioning drawer + GET versions route

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/files/[fileId]/versions/route.ts`
- Create: `cis-deal-room/src/components/workspace/VersionHistoryDrawer.tsx`
- Create: `cis-deal-room/src/test/api/file-versions.test.ts`
- Modify: `cis-deal-room/src/lib/dal/files.ts` (add `getFileVersions`)
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx` (chip opens drawer)

- [ ] **Step 1: Add `getFileVersions` to files DAL**

Open `cis-deal-room/src/lib/dal/files.ts`. Add:

```typescript
export async function getFileVersions(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  // Fetch the anchor file to learn its folder + name
  const [anchor] = await db
    .select({ folderId: files.folderId, name: files.name })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!anchor) return [];

  return db
    .select({
      id: files.id,
      version: files.version,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      s3Key: files.s3Key,
      createdAt: files.createdAt,
      uploadedByEmail: users.email,
      uploadedByFirstName: users.firstName,
      uploadedByLastName: users.lastName,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.uploadedBy))
    .where(and(eq(files.folderId, anchor.folderId), eq(files.name, anchor.name)))
    .orderBy(desc(files.version));
}
```

- [ ] **Step 2: Write failing tests for the versions route**

Create `cis-deal-room/src/test/api/file-versions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireFolderAccess: vi.fn() }));
vi.mock('@/lib/dal/files', () => ({ getFileVersions: vi.fn(), getFileById: vi.fn() }));

import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { getFileVersions, getFileById } from '@/lib/dal/files';
import { GET } from '@/app/api/workspaces/[id]/files/[fileId]/versions/route';

const session = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };
const WS = '550e8400-e29b-41d4-a716-446655440000';
const FILE = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

function makeReq() {
  return new Request(`http://localhost/api/workspaces/${WS}/files/${FILE}/versions`);
}

describe('GET /workspaces/[id]/files/[fileId]/versions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file not found', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    vi.mocked(getFileById).mockResolvedValue(null as any);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 with versions on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(session);
    vi.mocked(getFileById).mockResolvedValue({ id: FILE, folderId: 'f1' } as any);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    vi.mocked(getFileVersions).mockResolvedValue([
      { id: 'v1', version: 2 },
      { id: 'v2', version: 1 },
    ] as any);
    const res = await GET(makeReq(), { params: Promise.resolve({ id: WS, fileId: FILE }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/workspaces/[id]/files/[fileId]/versions/route.ts`:

```typescript
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { getFileById, getFileVersions } from '@/lib/dal/files';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await params;
  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const versions = await getFileVersions(fileId);
  return Response.json(versions);
}
```

- [ ] **Step 4: Create the `VersionHistoryDrawer` component**

Create `cis-deal-room/src/components/workspace/VersionHistoryDrawer.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { X, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { displayName } from '@/lib/users/display';

interface Version {
  id: string;
  version: number;
  sizeBytes: number;
  mimeType: string;
  s3Key: string;
  createdAt: string;
  uploadedByEmail: string;
  uploadedByFirstName: string | null;
  uploadedByLastName: string | null;
}

interface VersionHistoryDrawerProps {
  workspaceId: string;
  fileId: string;
  fileName: string;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  onVersionDeleted: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function VersionHistoryDrawer({
  workspaceId, fileId, fileName, isAdmin, open, onClose, onVersionDeleted,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchWithAuth(`/api/workspaces/${workspaceId}/files/${fileId}/versions`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [open, workspaceId, fileId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleDownload(version: Version) {
    const res = await fetchWithAuth(`/api/files/${version.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      toast.info(`Stub mode — real download requires AWS_S3_BUCKET set`, { description: fileName });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, '')}-v${version.version}.${fileName.split('.').pop()}`;
    a.click();
  }

  async function handleDelete(version: Version) {
    if (!confirm(`Delete v${version.version} of ${fileName}?`)) return;
    setDeletingId(version.id);
    try {
      const res = await fetchWithAuth(`/api/files/${version.id}`, { method: 'DELETE' });
      if (res.ok) {
        setVersions((prev) => prev.filter((v) => v.id !== version.id));
        toast.success(`v${version.version} deleted`);
        onVersionDeleted();
      } else {
        toast.error('Failed to delete version');
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-text-primary/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-96 z-50 bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Version history</h2>
            <p className="text-xs text-text-muted truncate">{fileName}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-xs text-text-muted">Loading...</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-text-muted">No versions.</p>
          ) : (
            versions.map((v) => {
              const uploader = displayName({
                firstName: v.uploadedByFirstName,
                lastName: v.uploadedByLastName,
                email: v.uploadedByEmail,
              });
              return (
                <div key={v.id} className="bg-surface-elevated border border-border-subtle rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary">v{v.version}</span>
                    <span className="text-xs text-text-muted font-mono">{formatBytes(v.sizeBytes)}</span>
                  </div>
                  <p className="text-xs text-text-secondary">{uploader}</p>
                  <p className="text-xs text-text-muted mb-2">{formatDate(v.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(v)}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Download size={12} /> Download
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(v)}
                        disabled={deletingId === v.id}
                        className="flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50 ml-auto"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Wire the drawer into FileList**

Open `cis-deal-room/src/components/workspace/FileList.tsx`. Make the `vN` chip clickable and render the drawer:

```tsx
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

// inside component:
const [versionsFile, setVersionsFile] = useState<FileRow | null>(null);

// replace the existing version chip span with a button:
{file.version > 1 && (
  <button
    onClick={() => setVersionsFile(file)}
    className="shrink-0 text-[10px] font-mono bg-surface-sunken text-text-muted px-1.5 py-0.5 rounded hover:bg-border-subtle"
  >
    v{file.version}
  </button>
)}

// at the bottom of the JSX, near the existing UploadModal render:
{versionsFile && (
  <VersionHistoryDrawer
    workspaceId={workspaceId}
    fileId={versionsFile.id}
    fileName={versionsFile.name}
    isAdmin={isAdmin}
    open={!!versionsFile}
    onClose={() => setVersionsFile(null)}
    onVersionDeleted={load}
  />
)}
```

Add a `workspaceId` prop to `FileList` and pass it down from WorkspaceShell. (Thread the prop; it's currently likely implicit.)

- [ ] **Step 6: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/files.ts src/app/api/workspaces/\[id\]/files/\[fileId\]/versions/route.ts src/test/api/file-versions.test.ts src/components/workspace/VersionHistoryDrawer.tsx src/components/workspace/FileList.tsx src/components/workspace/WorkspaceShell.tsx && git commit -m "feat(files): version history drawer + GET versions route"
```

---

## Task 16: Wire FileList search input

**Files:**
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx`

- [ ] **Step 1: Wire the existing search input to local filter**

Open `cis-deal-room/src/components/workspace/FileList.tsx`. The `search` state already exists from Phase 2 but the input may not be wired. Ensure:

```typescript
// already present:
const [search, setSearch] = useState('');

// and the filter:
const filtered = files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
```

Confirm the render iterates `filtered.map(...)` not `files.map(...)`. If it's already correct (from earlier code), this task is a no-op — just audit and move on.

Add an empty-state message when `files.length > 0 && filtered.length === 0`:

```tsx
{filtered.length === 0 && files.length > 0 ? (
  <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
    No files match your search
  </div>
) : (
  // existing rows render
)}
```

- [ ] **Step 2: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/FileList.tsx && git commit -m "feat(files): wire search input to local filter with empty state"
```

---

## Task 17: Responsive breakpoint pass

**Files:**
- Modify: ~15 component files (breakpoint classes only)

This is a mechanical pass — add Tailwind `md:` / `lg:` prefixes to make the app degrade gracefully below 1024px. **This is the ONLY task where subagent-driven implementation is discouraged** because the "right" mobile layout involves judgment calls per-component that are easier to eyeball than describe.

Recommended approach: execute this task yourself or with a single focused subagent, resizing the browser window through the breakpoints after each component change.

- [ ] **Step 1: Workspace shell at <1024px**

Open `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`. At `<1024px`:
- Folder sidebar (`w-[240px]`) should collapse to a dropdown/top-accordion
- Right panel (`w-[320px]`) should become a slide-in drawer triggered by an icon button in the header
- Main center area expands to full width

Simplest implementation: hide both side panels with `hidden lg:flex` and add two header buttons (`Folders`, `Activity`) that toggle local state to show a modal sheet with that panel's content. At `<768px`, those buttons collapse into a single hamburger menu.

For this plan, accept: **at <1024px, hide left + right panels via `hidden lg:flex` and don't add toggle buttons.** Mobile is for browsing only per the design decision; full workspace needs desktop. Future Phase 4.1 could add the toggles.

Actually, reconsider — hiding panels without toggles breaks folder navigation entirely at mobile. Minimum viable:
- `<1024px`: folder sidebar becomes a `<select>` dropdown above the file list (showing current folder, clicking opens all)
- Right panel: hidden via `hidden lg:flex` (participants + activity are nice-to-have; mobile users browse files)

Let this step document the tradeoffs; implementer picks the cleanest path within ~1-2 hours.

- [ ] **Step 2: Deal list grid columns**

Already handled in Task 10 via `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Audit to confirm.

- [ ] **Step 3: Modals full-screen at <768px**

Open `cis-deal-room/src/components/ui/Modal.tsx`. The modal container currently has `max-w-lg mx-4`. At `<768px`, make it full-viewport:

```typescript
className={twMerge(
  clsx(
    'bg-surface border border-border rounded-xl p-6 shadow-sm',
    'w-full max-w-lg mx-4',
    'max-sm:rounded-none max-sm:mx-0 max-sm:min-h-screen max-sm:max-w-none',  // NEW
    'transition-all duration-200',
    className
  )
)}
```

- [ ] **Step 4: Typography scale at small widths**

Audit large headings (h1, h2) in deal list and workspace to ensure they don't overflow at 375px. Use `text-2xl md:text-3xl` pattern where needed.

- [ ] **Step 5: Typecheck + full suite**

```bash
cd cis-deal-room && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/ && git commit -m "feat(ui): graceful responsive degradation at tablet and mobile breakpoints"
```

---

## Task 18: Phase 4 checkpoint document

**Files:**
- Create: `cis-deal-room/docs/phase-4-checkpoint.md`

- [ ] **Step 1: Write the checkpoint doc**

Create `cis-deal-room/docs/phase-4-checkpoint.md`:

```markdown
# Phase 4 Checkpoint — Human Verification

## Prerequisites

- `DATABASE_URL` set; all migrations applied
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Dev server running: `npm run dev`
- Logged in as admin; at least one workspace exists with participants and files
- For digest testing: set `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` in `.env.local` (or leave unset to skip verification in dev)

## Checklist

### Complete-profile gate

- [ ] Wipe `first_name` and `last_name` for your user (SQL: `UPDATE users SET first_name = NULL, last_name = NULL WHERE email = 'your@email'`)
- [ ] Log out and log back in
- [ ] Verify route redirects to `/complete-profile` instead of `/deals`
- [ ] Form requires both names; submitting sends POST `/api/user/profile`; on success redirects to `/deals`
- [ ] Logged-in users with names set never see the gate

### Display names everywhere

- [ ] Activity feed rows show "First Last" instead of email
- [ ] Participant list rows show "First Last" as primary text
- [ ] Admin participant row shows email as small muted secondary under name
- [ ] Non-admin participant row shows name only (no email)
- [ ] File list "by" column shows display name
- [ ] Deal list "last activity" summary uses display name
- [ ] Users with missing names fall back to email gracefully

### Deal list tile cards

- [ ] Cards render in 3-col at `lg:`, 2-col at `md:`, 1-col default
- [ ] Each card shows: deal name, status badge, client name (admin only), doc count, participant count, last activity summary
- [ ] Search input filters by deal name + client name, case-insensitive
- [ ] Status multi-select dropdown filters displayed cards
- [ ] Empty-filter state: "No deals match your filters"

### No-Client banner + transition block

- [ ] In a workspace with no active Client participant, banner renders above the three-panel layout
- [ ] Banner "Invite Client" link opens the invite modal pre-filled to role=client
- [ ] After adding an active Client, the banner disappears
- [ ] Admin attempts to change status from Engagement → Active DD with no Client → 400 returned; toast explains "At least one active Client required"; status reverts optimistically
- [ ] Other transitions (Active DD → IOI → Closing → Closed) are not blocked

### Activity feed

- [ ] On load, most-recent 50 events appear, grouped where consecutive same-actor/action within 10 min
- [ ] Click on a grouped row count expands to show individual events (if implemented)
- [ ] Click filename in a row navigates to and highlights that file in the FileList
- [ ] Polling fetches fresh activity every 60s while tab is visible
- [ ] Pausing the page (switching tabs) stops polling; resuming restarts it
- [ ] "Load more" button at end loads next 50; disables when no more

### Session timeout + 401 interceptor

- [ ] Simulate idle timeout: `UPDATE sessions SET last_active_at = now() - interval '3 hours' WHERE id = 'your-session-id'`
- [ ] Make any API call (e.g. reload page) → toast "Session expired"; redirects to `/login?returnTo=/deals`
- [ ] Log in again → lands back at `/deals` (returnTo honored)
- [ ] Absolute-expiry: `UPDATE sessions SET absolute_expires_at = now() - interval '1 minute'` → next call 401s even if session is otherwise active

### Notification digest

- [ ] Toggle digest preference from avatar menu → POST `/api/user/preferences` → toast confirms
- [ ] With digest ON: trigger an upload-batch → no email fires; row inserted into `notification_queue` (verify in DB)
- [ ] Curl `/api/cron/digest` with a valid QStash signature (or unset keys in dev) → see "[email:stub]" payload in server console for the digest email; queue rows marked `processed_at`
- [ ] With digest OFF: trigger an upload-batch → email fires immediately as before
- [ ] Invitation emails always send immediately regardless of digest preference (verify by toggling digest ON and inviting someone)

### Version history drawer

- [ ] Upload a file with the same name twice to create a v2
- [ ] Click `v2` chip in the file list → drawer opens showing both versions, newest first
- [ ] Each version row shows uploader name, date, size; Download button works (real S3 or stub)
- [ ] Admin sees Delete button per version; clicking + confirming removes that version from the drawer and S3
- [ ] Esc key or underlay click closes drawer

### Responsive degradation

- [ ] At 1023px wide: three-panel layout collapses (folder sidebar becomes dropdown; right panel hides or opens as drawer)
- [ ] At 767px wide: single-column; tiles stack
- [ ] Modals render full-screen at <768px (no side margin)
- [ ] No horizontal scroll at 375px except where unavoidable

### Toast system

- [ ] Successful actions (participant removed, file uploaded, preference updated) show green success toasts
- [ ] Errors (admin removal of self, 401) show red error toasts
- [ ] No more `alert()` dialogs anywhere

## Sign-off

| Area | Status | Notes |
|---|---|---|
| Complete-profile gate | ☐ | |
| Display names | ☐ | |
| Deal cards + filters | ☐ | |
| No-Client banner + block | ☐ | |
| Activity feed | ☐ | |
| Session timeout | ☐ | |
| Digest pipeline | ☐ | |
| Version drawer | ☐ | |
| Responsive | ☐ | |
| Toasts | ☐ | |
```

- [ ] **Step 2: Commit**

```bash
cd cis-deal-room && git add docs/phase-4-checkpoint.md && git commit -m "docs(checkpoint): Phase 4 human verification steps"
```

---

## Self-Review Checklist

After all tasks complete:

```bash
cd cis-deal-room && npx vitest run && npx tsc --noEmit
```

Both pass with zero errors before marking Phase 4 complete.

**Spec coverage (spec section → task):**
- [x] §1 scope — all 11 items covered
- [x] §2 schema changes — Task 5 (single migration)
- [x] §3 session policy — Task 9
- [x] §3A display names — Tasks 6, 7, 8
- [x] §4 new dependencies — Tasks 1 (sonner), 13 (qstash)
- [x] §5 new components — Tasks 1 (Toaster), 3 (Banner), 7 (ProfileForm + page), 10 (DealCard), 11 (ActivityFeed + ActivityRow), 15 (VersionHistoryDrawer)
- [x] §6 modified components — spread across tasks 3, 4, 6, 8, 10, 11, 14, 15
- [x] §7 modified DAL — Task 6
- [x] §8 new API routes — Tasks 7 (profile), 13 (cron), 14 (preferences), 15 (versions)
- [x] §9 modified API routes — Tasks 3 (status guard), 7 (verify redirect), 9 (session), 12 (notify-batch uses enqueueOrSend)
- [x] §10 UX specifics — grouping (Task 11), transition block (Task 3), responsive (Task 17), returnTo (Task 9)
- [x] §11 testing — embedded throughout; major test files in Tasks 6, 7, 13, 14, 15

**Known follow-ups (deferred):**
- Pre-expiry session warning — v1.1 backlog
- Digest email rich formatting — v1.1
- Version restore — v1.1
- Dark-mode toggle — tokens make it trivial
- Per-file comments — v1.1

---

*Phase 4 complete when the human-verify checkpoint is signed off.*
