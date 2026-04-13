# Phase 3.1 — Backend & IDOR Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend and security foundation for Phase 3 Collaboration: participant CRUD, real IDOR enforcement at every route boundary, invitation flow via flavored magic-link, activity-writes for participant actions, and upload-batch notification emails. No UI work — fully verifiable via curl + Vitest.

**Architecture:** Extend existing DAL/route patterns from Phases 1 and 2. Add two optional columns to `magic_link_tokens` (`purpose`, `redirect_to`) so invitation tokens share the same auth pipeline as login tokens. Replace the Phase 1 `requireDealAccess` / `requireFolderAccess` stubs with real implementations that join through `workspace_participants` / `folder_access`, with a role-based permission matrix resolving upload vs. download capability. Add participant, activity, and notify-upload-batch API routes under `/api/workspaces/[id]/`. Wrap Resend behind a `sendEmail()` helper that stubs to console when `RESEND_API_KEY` is absent; two new React Email templates for invitation and upload notifications.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · Neon PostgreSQL · Zod v4 · Resend (stub-mode) · React Email · Vitest

---

## File Map

| Action | Path |
|---|---|
| Modify | `cis-deal-room/src/db/schema.ts` |
| Create | `cis-deal-room/src/lib/dal/permissions.ts` |
| Create | `cis-deal-room/src/test/dal/permissions.test.ts` |
| Modify | `cis-deal-room/src/lib/dal/access.ts` |
| Create | `cis-deal-room/src/test/dal/access.test.ts` |
| Create | `cis-deal-room/src/lib/dal/participants.ts` |
| Create | `cis-deal-room/src/test/dal/participants.test.ts` |
| Modify | `cis-deal-room/src/lib/dal/folders.ts` |
| Create | `cis-deal-room/src/lib/email/send.ts` |
| Create | `cis-deal-room/src/lib/email/invitation.tsx` |
| Create | `cis-deal-room/src/lib/email/upload-batch.tsx` |
| Modify | `cis-deal-room/src/app/api/auth/send/route.ts` |
| Create | `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts` |
| Create | `cis-deal-room/src/app/api/workspaces/[id]/participants/[pid]/route.ts` |
| Create | `cis-deal-room/src/test/api/participants.test.ts` |
| Create | `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts` |
| Create | `cis-deal-room/src/test/api/activity.test.ts` |
| Create | `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts` |
| Create | `cis-deal-room/src/test/api/notify-upload-batch.test.ts` |
| Modify | `cis-deal-room/src/app/api/auth/verify/route.ts` |
| Modify | `cis-deal-room/src/app/api/files/presign-upload/route.ts` |
| Modify | `cis-deal-room/src/app/api/files/confirm/route.ts` |
| Modify | `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts` |
| Modify | `cis-deal-room/src/app/api/files/route.ts` |

---

## Task 1: Schema migration — magic_link_tokens columns + new activity enum values

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts`

- [ ] **Step 1: Add `purpose` column to `magicLinkTokens`**

Open `cis-deal-room/src/db/schema.ts`. Before the `magicLinkTokens` table definition, add a new enum:

```typescript
export const magicLinkPurposeEnum = pgEnum('magic_link_purpose', ['login', 'invitation']);
```

Modify the `magicLinkTokens` table to add two optional columns:

```typescript
export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  purpose: magicLinkPurposeEnum('purpose').notNull().default('login'),
  redirectTo: text('redirect_to'),
});
```

- [ ] **Step 2: Add two new `activity_action` enum values**

Locate `activityActionEnum` and append `'participant_updated'` and `'notified_batch'`:

```typescript
export const activityActionEnum = pgEnum('activity_action', [
  'uploaded',
  'downloaded',
  'viewed',
  'deleted',
  'invited',
  'removed',
  'created_folder',
  'renamed_folder',
  'created_workspace',
  'revoked_access',
  'status_changed',
  'participant_updated',
  'notified_batch',
]);
```

- [ ] **Step 3: Generate the Drizzle migration**

```bash
cd cis-deal-room && npx drizzle-kit generate
```

Expected: a new migration file in `src/db/migrations/` with `ALTER TABLE magic_link_tokens ADD COLUMN purpose ...`, `ADD COLUMN redirect_to ...`, `ALTER TYPE activity_action ADD VALUE 'participant_updated'`, `ALTER TYPE activity_action ADD VALUE 'notified_batch'`.

- [ ] **Step 4: Apply the migration**

```bash
cd cis-deal-room && npx drizzle-kit migrate
```

Expected: `[✓] Migrations applied` with no errors.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/db/schema.ts src/db/migrations/ && git commit -m "feat(schema): add magic_link_tokens.purpose/redirect_to and 2 activity actions"
```

---

## Task 2: Permission matrix resolver

**Files:**
- Create: `cis-deal-room/src/lib/dal/permissions.ts`
- Create: `cis-deal-room/src/test/dal/permissions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/dal/permissions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canPerform } from '@/lib/dal/permissions';

describe('canPerform()', () => {
  // Admin and CIS Team get everything in granted folders
  it('admin role can upload', () => {
    expect(canPerform('admin', 'upload')).toBe(true);
  });
  it('admin role can download', () => {
    expect(canPerform('admin', 'download')).toBe(true);
  });
  it('cis_team can upload', () => {
    expect(canPerform('cis_team', 'upload')).toBe(true);
  });
  it('cis_team can download', () => {
    expect(canPerform('cis_team', 'download')).toBe(true);
  });

  // Client / Counsel / Reps get upload+download
  it('client can upload', () => {
    expect(canPerform('client', 'upload')).toBe(true);
  });
  it('client can download', () => {
    expect(canPerform('client', 'download')).toBe(true);
  });
  it('counsel can upload and download', () => {
    expect(canPerform('counsel', 'upload')).toBe(true);
    expect(canPerform('counsel', 'download')).toBe(true);
  });
  it('buyer_rep can upload and download', () => {
    expect(canPerform('buyer_rep', 'upload')).toBe(true);
    expect(canPerform('buyer_rep', 'download')).toBe(true);
  });
  it('seller_rep can upload and download', () => {
    expect(canPerform('seller_rep', 'upload')).toBe(true);
    expect(canPerform('seller_rep', 'download')).toBe(true);
  });

  // View only — download only
  it('view_only can download', () => {
    expect(canPerform('view_only', 'download')).toBe(true);
  });
  it('view_only cannot upload', () => {
    expect(canPerform('view_only', 'upload')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/permissions.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dal/permissions'`

- [ ] **Step 3: Create the permissions module**

Create `cis-deal-room/src/lib/dal/permissions.ts`:

```typescript
export type ParticipantRole =
  | 'admin'
  | 'cis_team'
  | 'client'
  | 'counsel'
  | 'buyer_rep'
  | 'seller_rep'
  | 'view_only';

export type FolderAction = 'upload' | 'download';

/**
 * Resolves whether a participant with the given role can perform an action on
 * a folder they already have access to (via folder_access). This does NOT
 * check folder_access — callers must verify the membership row separately.
 *
 * Admin and CIS Team bypass folder_access entirely; this function still
 * returns true for their upload/download capability.
 */
export function canPerform(role: ParticipantRole, action: FolderAction): boolean {
  if (role === 'view_only') return action === 'download';
  // admin, cis_team, client, counsel, buyer_rep, seller_rep
  return true;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/permissions.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/permissions.ts src/test/dal/permissions.test.ts && git commit -m "feat(dal): add role-based permission matrix resolver"
```

---

## Task 3: Real `requireDealAccess`

**Files:**
- Modify: `cis-deal-room/src/lib/dal/access.ts`
- Create: `cis-deal-room/src/test/dal/access.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/dal/access.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectLimit = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
  },
}));

import { requireDealAccess } from '@/lib/dal/access';

const adminSession = { sessionId: 's1', userId: 'u1', userEmail: 'admin@cis.com', isAdmin: true };
const clientSession = { sessionId: 's2', userId: 'u2', userEmail: 'client@acme.com', isAdmin: false };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('requireDealAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin bypasses and does not query DB', async () => {
    await requireDealAccess(WORKSPACE_ID, adminSession);
    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('non-admin with active participant row resolves', async () => {
    mockSelectLimit.mockResolvedValue([{ id: 'p1', status: 'active' }]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).resolves.toBeUndefined();
  });

  it('non-admin with no participant row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });

  it('non-admin with only an invited (not active) row throws Unauthorized', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(requireDealAccess(WORKSPACE_ID, clientSession)).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 2: Run tests to confirm current stub passes them trivially**

```bash
cd cis-deal-room && npx vitest run src/test/dal/access.test.ts
```

Expected: the "throws Unauthorized" cases FAIL (current stub is a no-op so nothing throws).

- [ ] **Step 3: Replace the `requireDealAccess` stub with a real implementation**

Open `cis-deal-room/src/lib/dal/access.ts` and replace the function body:

```typescript
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants } from '@/db/schema';
import type { Session } from '@/types';

/**
 * Verify the session user has access to the given workspace.
 *
 * Admin users bypass the check. Non-admins must have an active
 * workspace_participants row for this workspace.
 */
export async function requireDealAccess(
  workspaceId: string,
  session: Session
): Promise<void> {
  if (session.isAdmin) return;

  const [row] = await db
    .select({ id: workspaceParticipants.id })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (!row) throw new Error('Unauthorized');
}
```

Leave the `requireFolderAccess` stub in place for now — Task 4 replaces it.

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/access.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/access.ts src/test/dal/access.test.ts && git commit -m "feat(dal): implement real requireDealAccess with admin bypass"
```

---

## Task 4: Real `requireFolderAccess`

**Files:**
- Modify: `cis-deal-room/src/lib/dal/access.ts`
- Modify: `cis-deal-room/src/test/dal/access.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `cis-deal-room/src/test/dal/access.test.ts`:

```typescript
import { requireFolderAccess } from '@/lib/dal/access';

const FOLDER_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('requireFolderAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin bypasses and does not query DB', async () => {
    await requireFolderAccess(FOLDER_ID, adminSession, 'upload');
    expect(mockSelectLimit).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when user has no folder_access row', async () => {
    mockSelectLimit.mockResolvedValue([]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).rejects.toThrow('Unauthorized');
  });

  it('client with folder_access can download', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'client' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).resolves.toBeUndefined();
  });

  it('client with folder_access can upload', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'client' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'upload')
    ).resolves.toBeUndefined();
  });

  it('view_only with folder_access can download', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'view_only' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'download')
    ).resolves.toBeUndefined();
  });

  it('view_only with folder_access cannot upload', async () => {
    mockSelectLimit.mockResolvedValue([{ role: 'view_only' }]);
    await expect(
      requireFolderAccess(FOLDER_ID, clientSession, 'upload')
    ).rejects.toThrow('Forbidden');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/access.test.ts
```

Expected: the six new `requireFolderAccess` tests FAIL (stub is a no-op).

- [ ] **Step 3: Replace `requireFolderAccess` with a real implementation**

Open `cis-deal-room/src/lib/dal/access.ts` and replace the `requireFolderAccess` function and its imports. The file should end up looking like:

```typescript
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants, folderAccess, folders } from '@/db/schema';
import { canPerform, type FolderAction, type ParticipantRole } from './permissions';
import type { Session } from '@/types';

// … requireDealAccess unchanged from Task 3 …

/**
 * Verify the session user can perform the given action on the folder.
 *
 * Admin users bypass. Non-admins must (a) have a folder_access row for this
 * folder and (b) their participant role must permit the requested action.
 */
export async function requireFolderAccess(
  folderId: string,
  session: Session,
  action: FolderAction
): Promise<void> {
  if (session.isAdmin) return;

  const [row] = await db
    .select({ role: workspaceParticipants.role })
    .from(folderAccess)
    .innerJoin(folders, eq(folders.id, folderAccess.folderId))
    .innerJoin(
      workspaceParticipants,
      eq(workspaceParticipants.id, folderAccess.participantId)
    )
    .where(
      and(
        eq(folderAccess.folderId, folderId),
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.status, 'active')
      )
    )
    .limit(1);

  if (!row) throw new Error('Unauthorized');

  if (!canPerform(row.role as ParticipantRole, action)) {
    throw new Error('Forbidden');
  }
}
```

**Note:** The test mocks `.select().from().where().limit()` with a flat chain, but this real query uses `innerJoin`. Update the mock in the test file to include `innerJoin` returning the chain:

Open `cis-deal-room/src/test/dal/access.test.ts` and replace the `db` mock at the top with a chain that supports both shapes:

```typescript
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: mockSelectLimit }),
          }),
        }),
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
  },
}));
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/access.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/access.ts src/test/dal/access.test.ts && git commit -m "feat(dal): implement requireFolderAccess with role-based permission check"
```

---

## Task 5: Participants DAL

**Files:**
- Create: `cis-deal-room/src/lib/dal/participants.ts`
- Create: `cis-deal-room/src/test/dal/participants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/dal/participants.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectChain = vi.fn();
const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/db', () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      mockTransaction(fn);
      return fn({
        select: () => ({ from: () => ({ where: () => ({ limit: mockSelectChain }) }) }),
        insert: () => ({ values: (v: unknown) => { mockInsertValues(v); return { returning: mockInsertReturning }; } }),
        update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
        delete: () => ({ where: mockDeleteWhere }),
      });
    },
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => mockSelectChain() }) }) }),
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import {
  getParticipants,
  inviteParticipant,
  updateParticipant,
  removeParticipant,
} from '@/lib/dal/participants';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PARTICIPANT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('getParticipants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(getParticipants(WORKSPACE_ID)).rejects.toThrow('Unauthorized');
  });

  it('returns participant rows joined with user email', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: 'p1', userId: 'u1', email: 'a@b.com', role: 'client', status: 'active' },
    ]);
    const rows = await getParticipants(WORKSPACE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('a@b.com');
  });
});

describe('inviteParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(
      inviteParticipant({ workspaceId: WORKSPACE_ID, email: 'x@y.com', role: 'client', folderIds: [] })
    ).rejects.toThrow('Unauthorized');
  });

  it('throws Admin required for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...adminSession, isAdmin: false });
    await expect(
      inviteParticipant({ workspaceId: WORKSPACE_ID, email: 'x@y.com', role: 'client', folderIds: [] })
    ).rejects.toThrow('Admin required');
  });

  it('creates participant row and returns it', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([{ id: 'user-1' }]); // user lookup returns existing user
    mockInsertReturning.mockResolvedValueOnce([{ id: 'p1', userId: 'user-1', role: 'client', status: 'invited' }]);
    const result = await inviteParticipant({
      workspaceId: WORKSPACE_ID,
      email: 'x@y.com',
      role: 'client',
      folderIds: [],
    });
    expect(result.id).toBe('p1');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('removeParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Admin required for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...adminSession, isAdmin: false });
    await expect(removeParticipant(PARTICIPANT_ID)).rejects.toThrow('Admin required');
  });

  it('throws when admin tries to remove themselves', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: adminSession.userId, email: 'admin@cis.com', role: 'admin' },
    ]);
    await expect(removeParticipant(PARTICIPANT_ID)).rejects.toThrow('Cannot remove self');
  });

  it('deletes participant row for different user', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: 'other-u', email: 'other@x.com', role: 'client' },
    ]);
    await removeParticipant(PARTICIPANT_ID);
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});

describe('updateParticipant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when admin tries to demote their own role', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    mockSelectChain.mockResolvedValue([
      { id: PARTICIPANT_ID, workspaceId: WORKSPACE_ID, userId: adminSession.userId, email: 'admin@cis.com', role: 'admin' },
    ]);
    await expect(
      updateParticipant(PARTICIPANT_ID, { role: 'client', folderIds: [] })
    ).rejects.toThrow('Cannot demote self');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/dal/participants.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dal/participants'`

- [ ] **Step 3: Create the participants DAL**

Create `cis-deal-room/src/lib/dal/participants.ts`:

```typescript
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  workspaceParticipants,
  folderAccess,
  magicLinkTokens,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import { generateToken, hashToken } from '@/lib/auth/tokens';
import type { ParticipantRole } from './permissions';

const INVITATION_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface InviteInput {
  workspaceId: string;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
}

interface UpdateInput {
  role: ParticipantRole;
  folderIds: string[];
}

/**
 * Returns all participants for a workspace joined with user email.
 * Any authenticated user with deal access can call this (caller must
 * verify dealAccess separately).
 */
export async function getParticipants(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db
    .select({
      id: workspaceParticipants.id,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
      status: workspaceParticipants.status,
      invitedAt: workspaceParticipants.invitedAt,
      activatedAt: workspaceParticipants.activatedAt,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.workspaceId, workspaceId));
}

/**
 * Creates or looks up the user by email, inserts a participant row
 * (status: 'invited'), inserts folder_access rows, creates an invitation
 * token valid for 3 days, and logs the activity. Returns the participant
 * row and the raw invitation token (caller is responsible for emailing it).
 *
 * If the user already has a participant row for this workspace with
 * status 'invited', refreshes the token instead of inserting a duplicate.
 */
export async function inviteParticipant(input: InviteInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
  const redirectTo = `/deals/${input.workspaceId}`;

  const result = await db.transaction(async (tx) => {
    // 1. Find-or-create user by email
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    const userId = existingUser
      ? existingUser.id
      : (await tx
          .insert(users)
          .values({ email: input.email, isAdmin: false })
          .returning({ id: users.id }))[0].id;

    // 2. Find-or-create participant row for this workspace
    const [existingParticipant] = await tx
      .select()
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, input.workspaceId),
          eq(workspaceParticipants.userId, userId)
        )
      )
      .limit(1);

    const participant =
      existingParticipant ??
      (await tx
        .insert(workspaceParticipants)
        .values({
          workspaceId: input.workspaceId,
          userId,
          role: input.role,
          status: 'invited',
        })
        .returning())[0];

    // 3. Insert folder_access rows (delete existing first if re-invite)
    await tx
      .delete(folderAccess)
      .where(eq(folderAccess.participantId, participant.id));

    if (input.folderIds.length > 0) {
      await tx.insert(folderAccess).values(
        input.folderIds.map((folderId) => ({
          folderId,
          participantId: participant.id,
        }))
      );
    }

    // 4. Create invitation token (delete any existing invitation tokens for this email)
    await tx.delete(magicLinkTokens).where(eq(magicLinkTokens.email, input.email));
    await tx.insert(magicLinkTokens).values({
      email: input.email,
      tokenHash,
      expiresAt,
      purpose: 'invitation',
      redirectTo,
    });

    return participant;
  });

  await logActivity(db, {
    workspaceId: input.workspaceId,
    userId: session.userId,
    action: 'invited',
    targetType: 'participant',
    targetId: result.id,
    metadata: { email: input.email, role: input.role, folderIds: input.folderIds },
  });

  return { participant: result, rawToken };
}

/**
 * Updates a participant's role and/or folder access atomically.
 * Admin-only. Admins cannot demote their own role.
 */
export async function updateParticipant(participantId: string, input: UpdateInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: workspaceParticipants.id,
      workspaceId: workspaceParticipants.workspaceId,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);

  if (!existing) throw new Error('Participant not found');

  // Self-guard: an admin cannot demote their own role away from 'admin'
  if (existing.userId === session.userId && input.role !== 'admin' && existing.role === 'admin') {
    throw new Error('Cannot demote self');
  }

  const beforeFolderAccessRows = await db
    .select({ folderId: folderAccess.folderId })
    .from(folderAccess)
    .where(eq(folderAccess.participantId, participantId));

  await db.transaction(async (tx) => {
    await tx
      .update(workspaceParticipants)
      .set({ role: input.role })
      .where(eq(workspaceParticipants.id, participantId));

    await tx.delete(folderAccess).where(eq(folderAccess.participantId, participantId));

    if (input.folderIds.length > 0) {
      await tx.insert(folderAccess).values(
        input.folderIds.map((folderId) => ({
          folderId,
          participantId,
        }))
      );
    }
  });

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'participant_updated',
    targetType: 'participant',
    targetId: participantId,
    metadata: {
      beforeRole: existing.role,
      afterRole: input.role,
      beforeFolderIds: beforeFolderAccessRows.map((r) => r.folderId),
      afterFolderIds: input.folderIds,
    },
  });
}

/**
 * Removes a participant from a workspace. Admin-only.
 * Admins cannot remove themselves.
 * folder_access rows cascade-delete via FK.
 */
export async function removeParticipant(participantId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: workspaceParticipants.id,
      workspaceId: workspaceParticipants.workspaceId,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);

  if (!existing) throw new Error('Participant not found');
  if (existing.userId === session.userId) throw new Error('Cannot remove self');

  await db
    .delete(workspaceParticipants)
    .where(eq(workspaceParticipants.id, participantId));

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'removed',
    targetType: 'participant',
    targetId: participantId,
    metadata: { email: existing.email, role: existing.role },
  });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/dal/participants.test.ts
```

Expected: all tests PASS. If some fail because the DB mock chain doesn't match the DAL's exact query shape, update the mocks — the DAL is correct.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/participants.ts src/test/dal/participants.test.ts && git commit -m "feat(dal): add participant CRUD with self-edit guards and re-invite"
```

---

## Task 6: Folder listing filter for non-admins

**Files:**
- Modify: `cis-deal-room/src/lib/dal/folders.ts`

- [ ] **Step 1: Read the current `getFoldersForWorkspace`**

Confirm `cis-deal-room/src/lib/dal/folders.ts` currently returns all folders for any authenticated user.

- [ ] **Step 2: Update the function to filter for non-admins**

Replace `getFoldersForWorkspace` with:

```typescript
import { eq, and, inArray, max, asc } from 'drizzle-orm';
import { db } from '@/db';
import { folders, folderAccess, workspaceParticipants } from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';

/**
 * Returns folders for a workspace, filtered by the user's access:
 * - Admin → all folders in the workspace.
 * - Non-admin → only folders they have a folder_access row for.
 *
 * Ordered by sortOrder ascending.
 */
export async function getFoldersForWorkspace(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  if (session.isAdmin) {
    return db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .orderBy(asc(folders.sortOrder));
  }

  // Non-admin: subquery of folderIds they have access to within this workspace
  const accessRows = await db
    .select({ folderId: folderAccess.folderId })
    .from(folderAccess)
    .innerJoin(
      workspaceParticipants,
      eq(workspaceParticipants.id, folderAccess.participantId)
    )
    .where(
      and(
        eq(workspaceParticipants.userId, session.userId),
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.status, 'active')
      )
    );

  const accessibleFolderIds = accessRows.map((r) => r.folderId);
  if (accessibleFolderIds.length === 0) return [];

  return db
    .select()
    .from(folders)
    .where(
      and(eq(folders.workspaceId, workspaceId), inArray(folders.id, accessibleFolderIds))
    )
    .orderBy(asc(folders.sortOrder));
}

// … leave createFolder / renameFolder / deleteFolder unchanged …
```

Keep the rest of the file (`createFolder`, `renameFolder`, `deleteFolder`) exactly as-is.

- [ ] **Step 3: Run the existing folders tests**

```bash
cd cis-deal-room && npx vitest run src/lib/dal/folders.test.ts
```

Expected: All existing tests still PASS (they test from an admin perspective, which still returns all folders).

- [ ] **Step 4: Run full suite to confirm no regressions**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all prior tests still GREEN.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/folders.ts && git commit -m "feat(dal): filter getFoldersForWorkspace by folder_access for non-admins"
```

---

## Task 7: Email helper + `InvitationEmail` template

**Files:**
- Create: `cis-deal-room/src/lib/email/send.ts`
- Create: `cis-deal-room/src/lib/email/invitation.tsx`
- Modify: `cis-deal-room/src/app/api/auth/send/route.ts`

- [ ] **Step 1: Create the `sendEmail()` helper with stub-mode**

Create `cis-deal-room/src/lib/email/send.ts`:

```typescript
import { Resend } from 'resend';
import type { ReactElement } from 'react';

/**
 * Thin wrapper over Resend.emails.send that returns a stub response when
 * RESEND_API_KEY is not configured. All Phase 2+ email flows route through
 * this helper so that local development works without Resend credentials.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[email:stub]', { to: input.to, subject: input.subject });
    return { id: 'stub' };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: 'CIS Partners <noreply@cispartners.com>',
    to: input.to,
    subject: input.subject,
    react: input.react,
  });

  return { id: result.data?.id ?? 'unknown' };
}
```

- [ ] **Step 2: Refactor the existing auth-send route to use the helper**

Open `cis-deal-room/src/app/api/auth/send/route.ts` and replace the Resend-specific lines:

Remove these lines:
```typescript
import { Resend } from 'resend';
// …
const resend = new Resend(process.env.RESEND_API_KEY);
// …
await resend.emails.send({
  from: 'CIS Partners <noreply@cispartners.com>',
  to: email,
  subject: 'Your CIS Deal Room sign-in link',
  react: MagicLinkEmail({ magicLink, email }),
});
```

Replace with:
```typescript
import { sendEmail } from '@/lib/email/send';
// …
await sendEmail({
  to: email,
  subject: 'Your CIS Deal Room sign-in link',
  react: MagicLinkEmail({ magicLink, email }),
});
```

- [ ] **Step 3: Create the `InvitationEmail` template**

Create `cis-deal-room/src/lib/email/invitation.tsx`:

```typescript
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface InvitationEmailProps {
  inviteLink: string;
  workspaceName: string;
  roleLabel: string;
  inviterEmail: string;
}

/**
 * Invitation email sent to a new participant when an admin invites them to
 * a deal workspace. Magic link is pre-authenticated and redirects directly
 * into the workspace; valid for 3 days.
 */
export function InvitationEmail({
  inviteLink,
  workspaceName,
  roleLabel,
  inviterEmail,
}: InvitationEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You have been invited to {workspaceName} on CIS Deal Room</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            <Text style={logoPlaceholderStyle}>CIS Partners</Text>
          </Section>

          <Heading style={headingStyle}>You&apos;re invited to {workspaceName}</Heading>

          <Text style={textStyle}>
            {inviterEmail} has invited you to collaborate on <strong>{workspaceName}</strong> as{' '}
            <strong>{roleLabel}</strong>. Click the button below to accept and sign in. This invitation is
            valid for 3 days.
          </Text>

          <Section style={buttonSectionStyle}>
            <Button href={inviteLink} style={buttonStyle}>
              Accept Invitation
            </Button>
          </Section>

          <Text style={smallTextStyle}>
            If you did not expect this invitation, you can safely ignore this email.
          </Text>

          <Text style={footerStyle}>
            CIS Partners Advisory &mdash; Confidential
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily: 'DM Sans, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '40px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '480px',
  margin: '0 auto',
  padding: '40px 32px',
};

const logoSectionStyle: React.CSSProperties = {
  marginBottom: '32px',
};

const logoPlaceholderStyle: React.CSSProperties = {
  color: '#E10600',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  margin: '0',
};

const headingStyle: React.CSSProperties = {
  color: '#0D0D0D',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
};

const textStyle: React.CSSProperties = {
  color: '#3f3f46',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const buttonSectionStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 24px',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#E10600',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
};

const smallTextStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 16px',
};

const footerStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '12px',
  margin: '0',
};
```

- [ ] **Step 4: Run tests to confirm nothing regressed**

```bash
cd cis-deal-room && npx vitest run
```

Expected: existing auth tests still PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/email/send.ts src/lib/email/invitation.tsx src/app/api/auth/send/route.ts && git commit -m "feat(email): add sendEmail helper with stub-mode and InvitationEmail template"
```

---

## Task 8: `UploadBatchNotificationEmail` template

**Files:**
- Create: `cis-deal-room/src/lib/email/upload-batch.tsx`

- [ ] **Step 1: Create the template**

Create `cis-deal-room/src/lib/email/upload-batch.tsx`:

```typescript
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface UploadBatchEmailProps {
  workspaceName: string;
  folderName: string;
  files: Array<{ fileName: string; sizeBytes: number }>;
  workspaceLink: string;
  uploaderEmail: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload notification email sent to every participant with download access
 * to a folder, after a batch of files has been uploaded. One email per
 * participant per batch (not per file).
 */
export function UploadBatchNotificationEmail({
  workspaceName,
  folderName,
  files,
  workspaceLink,
  uploaderEmail,
}: UploadBatchEmailProps) {
  const fileCount = files.length;
  const fileWord = fileCount === 1 ? 'file' : 'files';

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {fileCount} new {fileWord} in {folderName} on {workspaceName}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            <Text style={logoPlaceholderStyle}>CIS Partners</Text>
          </Section>

          <Heading style={headingStyle}>
            {fileCount} new {fileWord} uploaded
          </Heading>

          <Text style={textStyle}>
            {uploaderEmail} uploaded {fileCount} {fileWord} to <strong>{folderName}</strong> in{' '}
            <strong>{workspaceName}</strong>.
          </Text>

          <Section style={fileListStyle}>
            {files.map((f, i) => (
              <Text key={i} style={fileItemStyle}>
                <span style={fileNameStyle}>{f.fileName}</span>{' '}
                <span style={fileSizeStyle}>({formatBytes(f.sizeBytes)})</span>
              </Text>
            ))}
          </Section>

          <Section style={buttonSectionStyle}>
            <Button href={workspaceLink} style={buttonStyle}>
              Open Workspace
            </Button>
          </Section>

          <Text style={footerStyle}>
            CIS Partners Advisory &mdash; Confidential
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily: 'DM Sans, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '40px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '480px',
  margin: '0 auto',
  padding: '40px 32px',
};

const logoSectionStyle: React.CSSProperties = {
  marginBottom: '32px',
};

const logoPlaceholderStyle: React.CSSProperties = {
  color: '#E10600',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  margin: '0',
};

const headingStyle: React.CSSProperties = {
  color: '#0D0D0D',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
};

const textStyle: React.CSSProperties = {
  color: '#3f3f46',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const fileListStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '0 0 24px',
};

const fileItemStyle: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.7',
  margin: '0',
  color: '#0D0D0D',
};

const fileNameStyle: React.CSSProperties = {
  fontWeight: '600',
};

const fileSizeStyle: React.CSSProperties = {
  color: '#71717a',
};

const buttonSectionStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 24px',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#E10600',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
};

const footerStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '12px',
  margin: '0',
};
```

- [ ] **Step 2: Typecheck**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/lib/email/upload-batch.tsx && git commit -m "feat(email): add UploadBatchNotificationEmail template"
```

---

## Task 9: Participants API routes (GET, POST)

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts`
- Create: `cis-deal-room/src/test/api/participants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/api/participants.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));
vi.mock('@/lib/dal/participants', () => ({
  getParticipants: vi.fn(),
  inviteParticipant: vi.fn(),
}));
vi.mock('@/lib/dal/workspaces', () => ({
  getWorkspaceById: vi.fn(),
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getParticipants, inviteParticipant } from '@/lib/dal/participants';
import { GET, POST } from '@/app/api/workspaces/[id]/participants/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const clientSession = { sessionId: 's2', userId: 'client-u', userEmail: 'client@x.com', isAdmin: false };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeGet() {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/participants`);
}

function makePost(body: object) {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/workspaces/[id]/participants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns list of participants for authorized user', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    vi.mocked(getParticipants).mockResolvedValue([
      { id: 'p1', userId: 'u1', email: 'a@b.com', role: 'client', status: 'active' },
    ] as any);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/workspaces/[id]/participants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(clientSession);
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    const res = await POST(
      makePost({ email: 'not-an-email', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('creates participant, sends invitation email, returns 201', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(inviteParticipant).mockResolvedValue({
      participant: { id: 'p1', userId: 'u1', role: 'client', status: 'invited' } as any,
      rawToken: 'fake-token',
    });
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('p1');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/workspaces/[id]/participants/route'`

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/workspaces/[id]/participants/route.ts`:

```typescript
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getParticipants, inviteParticipant } from '@/lib/dal/participants';
import { getWorkspaceById } from '@/lib/dal/workspaces';
import { sendEmail } from '@/lib/email/send';
import { InvitationEmail } from '@/lib/email/invitation';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    'admin',
    'cis_team',
    'client',
    'counsel',
    'buyer_rep',
    'seller_rep',
    'view_only',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
});

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  cis_team: 'CIS Team',
  client: 'Client',
  counsel: 'Counsel',
  buyer_rep: 'Buyer Rep',
  seller_rep: 'Seller Rep',
  view_only: 'View Only',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await getParticipants(workspaceId);
  return Response.json(rows);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;

  let parsed: z.infer<typeof inviteSchema>;
  try {
    parsed = inviteSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const { participant, rawToken } = await inviteParticipant({
    workspaceId,
    email: parsed.email,
    role: parsed.role,
    folderIds: parsed.folderIds,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const inviteLink = `${appUrl}/auth/verify?token=${rawToken}&email=${encodeURIComponent(parsed.email)}`;

  // Resolve role label with contextual Rep naming
  let roleLabel = ROLE_LABELS[parsed.role];
  if (parsed.role === 'seller_rep') roleLabel = 'Seller Rep';
  if (parsed.role === 'buyer_rep') roleLabel = 'Buyer Rep';

  await sendEmail({
    to: parsed.email,
    subject: `You're invited to ${workspace.name} on CIS Deal Room`,
    react: InvitationEmail({
      inviteLink,
      workspaceName: workspace.name,
      roleLabel,
      inviterEmail: session.userEmail,
    }),
  });

  return Response.json(participant, { status: 201 });
}
```

- [ ] **Step 4: Verify `getWorkspaceById` exists in the workspaces DAL**

Open `cis-deal-room/src/lib/dal/workspaces.ts` and confirm there is a `getWorkspaceById` exported. If it does not exist, add this function near the other read functions:

```typescript
export async function getWorkspaceById(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room && git add src/app/api/workspaces/\[id\]/participants/route.ts src/test/api/participants.test.ts src/lib/dal/workspaces.ts && git commit -m "feat(api): add GET/POST /workspaces/[id]/participants with invitation email"
```

---

## Task 10: Participants API routes (PATCH, DELETE)

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/participants/[pid]/route.ts`
- Modify: `cis-deal-room/src/test/api/participants.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `cis-deal-room/src/test/api/participants.test.ts`:

```typescript
vi.mock('@/lib/dal/participants', () => ({
  getParticipants: vi.fn(),
  inviteParticipant: vi.fn(),
  updateParticipant: vi.fn(),
  removeParticipant: vi.fn(),
}));

import { updateParticipant, removeParticipant } from '@/lib/dal/participants';
import { PATCH, DELETE } from '@/app/api/workspaces/[id]/participants/[pid]/route';

const PARTICIPANT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

function makePatch(body: object) {
  return new Request(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/participants/${PARTICIPANT_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function makeDelete() {
  return new Request(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/participants/${PARTICIPANT_ID}`,
    { method: 'DELETE' }
  );
}

describe('PATCH /api/workspaces/[id]/participants/[pid]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await PATCH(
      makePatch({ role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(clientSession);
    const res = await PATCH(
      makePatch({ role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when DAL throws Cannot demote self', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(updateParticipant).mockRejectedValue(new Error('Cannot demote self'));
    const res = await PATCH(
      makePatch({ role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(updateParticipant).mockResolvedValue(undefined);
    const res = await PATCH(
      makePatch({ role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/workspaces/[id]/participants/[pid]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await DELETE(
      makeDelete(),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(clientSession);
    const res = await DELETE(
      makeDelete(),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when DAL throws Cannot remove self', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(removeParticipant).mockRejectedValue(new Error('Cannot remove self'));
    const res = await DELETE(
      makeDelete(),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 204 on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(removeParticipant).mockResolvedValue(undefined);
    const res = await DELETE(
      makeDelete(),
      { params: Promise.resolve({ id: WORKSPACE_ID, pid: PARTICIPANT_ID }) }
    );
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants.test.ts
```

Expected: the new PATCH/DELETE tests FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/workspaces/[id]/participants/[pid]/route.ts`:

```typescript
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { updateParticipant, removeParticipant } from '@/lib/dal/participants';

const patchSchema = z.object({
  role: z.enum([
    'admin',
    'cis_team',
    'client',
    'counsel',
    'buyer_rep',
    'seller_rep',
    'view_only',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { pid } = await params;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    await updateParticipant(pid, { role: parsed.role, folderIds: parsed.folderIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    if (message === 'Participant not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { pid } = await params;

  try {
    await removeParticipant(pid);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    if (message === 'Participant not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 400 });
  }

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/api/participants.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/workspaces/\[id\]/participants/\[pid\]/route.ts src/test/api/participants.test.ts && git commit -m "feat(api): add PATCH/DELETE /participants/[pid] with self-guard error mapping"
```

---

## Task 11: Activity API route

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`
- Create: `cis-deal-room/src/test/api/activity.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/api/activity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectOrderBy = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => ({ offset: mockSelectOrderBy }) }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { GET } from '@/app/api/workspaces/[id]/activity/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeGet(query = '') {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/activity${query}`);
}

describe('GET /api/workspaces/[id]/activity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks deal access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(403);
  });

  it('returns activity rows on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    mockSelectOrderBy.mockResolvedValue([
      { id: 'a1', action: 'uploaded', actorEmail: 'u@x.com', createdAt: new Date() },
    ]);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('accepts ?limit and ?offset query params', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    mockSelectOrderBy.mockResolvedValue([]);
    const res = await GET(makeGet('?limit=10&offset=20'), {
      params: Promise.resolve({ id: WORKSPACE_ID }),
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/api/activity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`:

```typescript
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { activityLogs, users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query parameters' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      targetType: activityLogs.targetType,
      targetId: activityLogs.targetId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      actorEmail: users.email,
    })
    .from(activityLogs)
    .innerJoin(users, eq(users.id, activityLogs.userId))
    .where(eq(activityLogs.workspaceId, workspaceId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(parsed.data.limit)
    .offset(parsed.data.offset);

  return Response.json(rows);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/api/activity.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/workspaces/\[id\]/activity/route.ts src/test/api/activity.test.ts && git commit -m "feat(api): add GET /workspaces/[id]/activity with pagination"
```

---

## Task 12: Notify-upload-batch API route

**Files:**
- Create: `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts`
- Create: `cis-deal-room/src/test/api/notify-upload-batch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/api/notify-upload-batch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireFolderAccess: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));
vi.mock('@/lib/dal/activity', () => ({ logActivity: vi.fn() }));

const mockFetchBatch = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => mockFetchBatch(),
        }),
        where: () => mockFetchBatch(),
      }),
    }),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { sendEmail } from '@/lib/email/send';
import { POST } from '@/app/api/workspaces/[id]/notify-upload-batch/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const FOLDER_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const FILE_ID = '7aa8c920-aebe-42e2-9102-00d15fd542d9';

function makePost(body: object) {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/notify-upload-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/workspaces/[id]/notify-upload-batch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks folder upload access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('sends no emails when no other participants have download access', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    // First query: files → [{fileName, sizeBytes}]
    // Second query: workspace → [{name}]
    // Third query: folder → [{name}]
    // Fourth query: participants with download access → []
    mockFetchBatch
      .mockResolvedValueOnce([{ id: FILE_ID, name: 'x.pdf', sizeBytes: 100 }])
      .mockResolvedValueOnce([{ name: 'Workspace' }])
      .mockResolvedValueOnce([{ name: 'Folder' }])
      .mockResolvedValueOnce([]);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('sends one email per eligible recipient', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireFolderAccess).mockResolvedValue(undefined);
    mockFetchBatch
      .mockResolvedValueOnce([{ id: FILE_ID, name: 'x.pdf', sizeBytes: 100 }])
      .mockResolvedValueOnce([{ name: 'Workspace' }])
      .mockResolvedValueOnce([{ name: 'Folder' }])
      .mockResolvedValueOnce([
        { email: 'a@x.com', userId: 'u-a', role: 'client' },
        { email: 'b@x.com', userId: 'u-b', role: 'view_only' },
      ]);
    const res = await POST(
      makePost({ folderId: FOLDER_ID, fileIds: [FILE_ID] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/api/notify-upload-batch.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `cis-deal-room/src/app/api/workspaces/[id]/notify-upload-batch/route.ts`:

```typescript
import { z } from 'zod';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  files,
  workspaces,
  folders,
  folderAccess,
  workspaceParticipants,
  users,
} from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';
import { sendEmail } from '@/lib/email/send';
import { UploadBatchNotificationEmail } from '@/lib/email/upload-batch';
import { canPerform, type ParticipantRole } from '@/lib/dal/permissions';

const bodySchema = z.object({
  folderId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { folderId, fileIds } = parsed;

  try {
    await requireFolderAccess(folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch file rows, workspace, folder
  const fileRows = await db
    .select({ id: files.id, name: files.name, sizeBytes: files.sizeBytes })
    .from(files)
    .where(inArray(files.id, fileIds));

  if (fileRows.length === 0) {
    return Response.json({ error: 'No matching files' }, { status: 400 });
  }

  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const [folder] = await db
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  if (!workspace || !folder) {
    return Response.json({ error: 'Workspace or folder not found' }, { status: 404 });
  }

  // Fetch participants with download access to this folder (excluding uploader)
  const eligible = await db
    .select({
      email: users.email,
      userId: users.id,
      role: workspaceParticipants.role,
    })
    .from(folderAccess)
    .innerJoin(workspaceParticipants, eq(workspaceParticipants.id, folderAccess.participantId))
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(
      and(
        eq(folderAccess.folderId, folderId),
        eq(workspaceParticipants.status, 'active')
      )
    );

  const recipients = eligible.filter(
    (r) =>
      r.userId !== session.userId &&
      canPerform(r.role as ParticipantRole, 'download')
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const workspaceLink = `${appUrl}/deals/${workspaceId}`;

  // Send emails, tolerant of individual failures
  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: `${fileRows.length} new file${fileRows.length === 1 ? '' : 's'} in ${folder.name}`,
        react: UploadBatchNotificationEmail({
          workspaceName: workspace.name,
          folderName: folder.name,
          files: fileRows.map((f) => ({ fileName: f.name, sizeBytes: f.sizeBytes })),
          workspaceLink,
          uploaderEmail: session.userEmail,
        }),
      });
    } catch (err) {
      console.warn('[notify-upload-batch] send failure:', err);
    }
  }

  await logActivity(db, {
    workspaceId,
    userId: session.userId,
    action: 'notified_batch',
    targetType: 'folder',
    targetId: folderId,
    metadata: { fileIds, recipientCount: recipients.length },
  });

  return Response.json({ success: true, recipientCount: recipients.length });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/api/notify-upload-batch.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/workspaces/\[id\]/notify-upload-batch/route.ts src/test/api/notify-upload-batch.test.ts && git commit -m "feat(api): add POST /notify-upload-batch with per-participant fan-out"
```

---

## Task 13: Verify route — invitation branch

**Files:**
- Modify: `cis-deal-room/src/app/api/auth/verify/route.ts`

- [ ] **Step 1: Update the verify route to handle invitation tokens**

Open `cis-deal-room/src/app/api/auth/verify/route.ts`. Modify the token-consumption section (after the "Valid token → consume it" comment) to branch on `purpose`:

Find this block near the end:
```typescript
  // 6. Upsert user (creates account on first use, updates timestamp on subsequent logins)
  const [user] = await db
    .insert(users)
    .values({ email, isAdmin: false })
    .onConflictDoUpdate({
      target: users.email,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });

  // 7. Create database session and set cookie
  const sessionId = await createSession(user.id);
  const response = Response.redirect(`${appUrl}/deals`);
  setSessionCookie(response, sessionId);

  return response;
```

Replace with:
```typescript
  // 6. Upsert user (creates account on first use, updates timestamp on subsequent logins)
  const [user] = await db
    .insert(users)
    .values({ email, isAdmin: false })
    .onConflictDoUpdate({
      target: users.email,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });

  // 7. If invitation token, flip matching participant rows for this user to active
  if (tokenRow.purpose === 'invitation') {
    await db
      .update(workspaceParticipants)
      .set({ status: 'active', activatedAt: new Date() })
      .where(
        and(
          eq(workspaceParticipants.userId, user.id),
          eq(workspaceParticipants.status, 'invited')
        )
      );
  }

  // 8. Create database session and set cookie
  const sessionId = await createSession(user.id);
  const redirectTarget =
    tokenRow.purpose === 'invitation' && tokenRow.redirectTo
      ? `${appUrl}${tokenRow.redirectTo}`
      : `${appUrl}/deals`;
  const response = Response.redirect(redirectTarget);
  setSessionCookie(response, sessionId);

  return response;
```

Add these imports at the top of the file if not already present:
```typescript
import { eq, and } from 'drizzle-orm';
import { workspaceParticipants } from '@/db/schema';
```

- [ ] **Step 2: Run existing verify tests**

```bash
cd cis-deal-room && npx vitest run src/app/api/auth/verify/route.test.ts
```

Expected: existing login-token tests still PASS.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/app/api/auth/verify/route.ts && git commit -m "feat(auth): branch verify route on token.purpose for invitation redirect"
```

---

## Task 14: IDOR retrofit — file routes

**Files:**
- Modify: `cis-deal-room/src/app/api/files/presign-upload/route.ts`
- Modify: `cis-deal-room/src/app/api/files/confirm/route.ts`
- Modify: `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts`
- Modify: `cis-deal-room/src/app/api/files/route.ts`

- [ ] **Step 1: Retrofit `presign-upload` route**

Open `cis-deal-room/src/app/api/files/presign-upload/route.ts`.

Add import at top:
```typescript
import { requireFolderAccess } from '@/lib/dal/access';
```

Immediately after the type/size validation block (line ~53) and before the duplicate check, add:
```typescript
  // IDOR enforcement: confirm caller has upload permission on this folder
  try {
    await requireFolderAccess(folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

- [ ] **Step 2: Retrofit `confirm` route**

Open `cis-deal-room/src/app/api/files/confirm/route.ts`.

Add import at top:
```typescript
import { requireFolderAccess } from '@/lib/dal/access';
```

Immediately after the schema parse succeeds (after `parsed = schema.parse(...)`) and before the `checkDuplicate` block, add:
```typescript
  try {
    await requireFolderAccess(parsed.folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

- [ ] **Step 3: Retrofit `presign-download` route**

Open `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts`.

Add import at top:
```typescript
import { requireFolderAccess } from '@/lib/dal/access';
```

After the `file` row is fetched (so we have `file.folderId`) and before the stub branch, add:
```typescript
  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

- [ ] **Step 4: Retrofit `GET /api/files` list route**

Open `cis-deal-room/src/app/api/files/route.ts`.

Add import at top:
```typescript
import { requireFolderAccess } from '@/lib/dal/access';
```

After the Zod parse succeeds (so we have `parsed.data.folderId`), add:
```typescript
  try {
    await requireFolderAccess(parsed.data.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

- [ ] **Step 5: Run full test suite — confirm no regressions**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all existing file-route tests still PASS. Their mocks already stub `requireFolderAccess` behavior (or the check is a no-op on admin — verify by reading failing tests if any).

**Note:** Some existing file-route tests may break because they don't mock `requireFolderAccess`. Fix by adding `vi.mock('@/lib/dal/access', () => ({ requireFolderAccess: vi.fn() }))` and explicit `vi.mocked(requireFolderAccess).mockResolvedValue(undefined)` to those test files so they pass through.

- [ ] **Step 6: Typecheck**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room && git add src/app/api/files/ src/test/files/ && git commit -m "feat(security): add requireFolderAccess to all file routes (IDOR retrofit)"
```

---

## Task 15: IDOR retrofit — workspace and folder routes

**Files:**
- Modify: existing workspace and folder API routes (enumerated below)

- [ ] **Step 1: Enumerate existing workspace/folder routes**

Run:
```bash
cd cis-deal-room && find src/app/api/workspaces src/app/api/folders -name 'route.ts' 2>/dev/null
```

Expected list includes (at minimum):
- `src/app/api/workspaces/route.ts`
- `src/app/api/workspaces/[id]/route.ts`
- `src/app/api/workspaces/[id]/folders/route.ts`
- `src/app/api/workspaces/[id]/status/route.ts`
- `src/app/api/folders/[id]/route.ts`

- [ ] **Step 2: Retrofit `GET /api/workspaces/[id]`**

Open `cis-deal-room/src/app/api/workspaces/[id]/route.ts` (the GET handler).

Add import:
```typescript
import { requireDealAccess } from '@/lib/dal/access';
```

After `verifySession` and before any DB read, add:
```typescript
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

(where `workspaceId` is the params value)

- [ ] **Step 3: Retrofit `GET /api/workspaces/[id]/folders`**

Open `cis-deal-room/src/app/api/workspaces/[id]/folders/route.ts`.

Add import + check:
```typescript
import { requireDealAccess } from '@/lib/dal/access';

// inside GET, after verifySession:
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
```

The DAL's `getFoldersForWorkspace` (updated in Task 6) already filters for non-admins, so this route just needs the deal-access gate.

- [ ] **Step 4: Verify admin-only routes already enforce isAdmin**

Open each of:
- `src/app/api/workspaces/route.ts` — POST handler
- `src/app/api/workspaces/[id]/status/route.ts` — PATCH handler
- `src/app/api/folders/[id]/route.ts` — PATCH and DELETE handlers

Each should contain something like:
```typescript
if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
```

If any of them are missing this guard, add it immediately after the `verifySession` check.

- [ ] **Step 5: Run full test suite — confirm no regressions**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all existing tests still PASS. If any existing workspace/folder route tests break (because they don't mock `requireDealAccess`), add the mock to those test files:
```typescript
vi.mock('@/lib/dal/access', () => ({
  requireDealAccess: vi.fn().mockResolvedValue(undefined),
  requireFolderAccess: vi.fn().mockResolvedValue(undefined),
}));
```

- [ ] **Step 6: Typecheck**

```bash
cd cis-deal-room && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room && git add src/app/api/workspaces/ src/app/api/folders/ src/test/ && git commit -m "feat(security): add requireDealAccess to workspace/folder GET routes"
```

---

## Self-Review Checklist

After all tasks complete:

```bash
cd cis-deal-room && npx vitest run && npx tsc --noEmit
```

Both should pass with zero errors before moving to Plan 3.2.

**Spec coverage (section → task):**
- [x] §2 invitation flow — Tasks 1, 5, 9, 13
- [x] §3 participant management — Tasks 5, 9, 10
- [x] §4 upload-batch notification — Task 12
- [x] §5 email service — Tasks 7, 8
- [x] §6 IDOR retrofit — Tasks 3, 4, 6, 14, 15
- [x] §7 session invalidation (no session surgery, relies on §6) — naturally satisfied by Task 3
- [x] §8 activity log writes — Tasks 5, 12 (via `logActivity` in DAL)

**Out-of-scope for 3.1 (Plan 3.2 territory):**
- InviteModal / EditParticipantModal UI
- ParticipantList component
- UploadModal batch-notify call
- End-to-end human-verify checkpoint

---

*Plan 3.2 (UI & end-to-end) to be written after Plan 3.1 ships and is verified.*
