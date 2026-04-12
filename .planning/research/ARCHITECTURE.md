# Architecture Patterns

**Domain:** Secure document portal (M&A deal room)
**Researched:** 2026-04-12
**Overall Confidence:** MEDIUM-HIGH (S3 patterns verified via official docs; Auth.js and Next.js patterns based on training data -- verify Auth.js v5 API during implementation)

---

## Recommended Architecture

### System Overview

```
                                   +-------------------+
                                   |   Resend (Email)  |
                                   +--------+----------+
                                            ^
                                            | magic link emails,
                                            | upload notifications
                                            |
+------------+    HTTPS     +---------------+---------------+
|            | <----------> |         Next.js App            |
|  Browser   |              |  (Vercel — App Router)         |
|            | -----------> |                                |
+-----+------+   requests  |  middleware.ts (auth gate)      |
      |                     |  /app/api/* (route handlers)   |
      |                     |  Server Components + Actions   |
      |                     +-------+---------------+-------+
      |                             |               |
      |                             v               v
      |                     +-------+------+ +------+------+
      |                     |  PostgreSQL  | |   AWS IAM   |
      |                     |  (Neon)      | |  (S3 creds) |
      |                     +--------------+ +------+------+
      |                                            |
      |          presigned URL (PUT/GET)            v
      +-------------------------------------------->
                                            +------+------+
                                            |   AWS S3    |
                                            | (encrypted) |
                                            +-------------+
```

**Key principle:** Files never transit through the app server. The Next.js backend generates presigned URLs; the browser uploads/downloads directly to/from S3. The app server only handles metadata, auth, and URL generation.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Next.js Middleware** (`middleware.ts`) | Session validation, route protection, redirect unauthenticated users | Auth session (JWT cookie) |
| **Auth Module** (`/lib/auth.ts`) | Magic link generation, session creation/validation, token management | PostgreSQL (users, sessions, tokens), Resend (email delivery) |
| **API Route Handlers** (`/app/api/*`) | Presigned URL generation, participant management, CRUD operations | PostgreSQL, AWS S3 (via SDK), Resend |
| **Server Components** (`/app/(portal)/*`) | Page rendering with data, session-aware layouts, permission-filtered views | PostgreSQL (read), Auth session |
| **Server Actions** (`/lib/actions/*`) | Mutations: create deal, invite participant, rename folder, log activity | PostgreSQL (write), Resend, S3 (delete ops) |
| **PostgreSQL (Neon)** | All application state: users, deals, folders, files (metadata), permissions, activity log | Accessed by API routes, server components, server actions |
| **AWS S3** | File blob storage with AES-256 encryption, CORS-locked to portal domain | Accessed directly by browser (presigned URLs), metadata managed via API |
| **Resend** | Transactional email: magic links, upload notifications, deal invitations | Called by auth module and server actions |

---

## Data Flow: Magic Link Authentication

### End-to-End Flow

```
1. User enters email on /login
2. Server Action: validate email, generate token, store in DB
3. Resend sends email with link: /api/auth/verify?token=xxx
4. User clicks link in email
5. GET /api/auth/verify: validate token, check expiry, mark used
6. Create JWT session cookie (httpOnly, secure, sameSite=lax)
7. Redirect to /deals (or original destination)
8. Middleware checks JWT on every subsequent request
```

### Auth Architecture Decision: Custom JWT over NextAuth.js

**Recommendation:** Build a custom magic link auth system rather than using NextAuth.js (Auth.js v5).

**Rationale:**
- Auth.js v5 email provider requires a database adapter and verification_tokens table, which adds ORM coupling and complexity for what is fundamentally a simple flow
- The CIS Deal Room has exactly one auth method (magic links) with no future plans for OAuth -- Auth.js's value proposition is multi-provider abstraction
- Custom implementation is ~150 lines of code: token generation, email sending, token verification, JWT signing
- Full control over token expiry (24-hour sessions), email templates (CIS branding), and the verify endpoint
- No dependency version risk from Auth.js v5 (which has had breaking changes between beta/stable releases)

**Confidence:** MEDIUM -- Auth.js v5 would also work fine; the custom approach is recommended for simplicity given the single-provider constraint. If multi-provider auth is ever needed, migrate to Auth.js then.

### Implementation Details

```typescript
// /lib/auth.ts — Core auth module

// Token generation: crypto.randomBytes(32).toString('hex')
// Token storage: magic_links table with email, token_hash, expires_at, used_at
// IMPORTANT: Store hash of token, not raw token (bcrypt or sha256)
// Token expiry: 15 minutes (for the magic link itself)
// Session expiry: 24 hours (JWT cookie)

// JWT payload:
{
  sub: userId,        // UUID
  email: string,
  role: 'admin' | 'cis_team',  // Global role (deal-level roles stored separately)
  iat: number,
  exp: number         // 24 hours from issuance
}

// Cookie: httpOnly, secure, sameSite='lax', path='/', maxAge=86400
```

### Session Validation Pattern

```typescript
// /lib/auth.ts
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function getSession() {
  const token = cookies().get('session')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as SessionPayload;
  } catch {
    return null;  // expired or tampered
  }
}

// Use jose library (not jsonwebtoken) — jose works in Edge Runtime
// This matters because middleware.ts runs in Edge Runtime on Vercel
```

---

## Data Flow: File Upload (Presigned URL)

### End-to-End Upload Flow

```
Browser                     Next.js API                  S3                    PostgreSQL
  |                            |                          |                       |
  |  1. POST /api/files/upload |                          |                       |
  |     { dealId, folderId,    |                          |                       |
  |       fileName, fileSize,  |                          |                       |
  |       contentType }        |                          |                       |
  |--------------------------->|                          |                       |
  |                            |  2. Validate:            |                       |
  |                            |     - user authenticated |                       |
  |                            |     - has upload perm    |                       |
  |                            |     - file type allowed  |                       |
  |                            |     - size <= 500MB      |                       |
  |                            |     - check duplicates   |                       |
  |                            |                          |                       |
  |                            |  3. Generate S3 key:     |                       |
  |                            |     deals/{dealId}/      |                       |
  |                            |     {folderId}/{uuid}/   |                       |
  |                            |     {sanitized-filename} |                       |
  |                            |                          |                       |
  |                            |  4. PutObject presigned  |                       |
  |                            |---(15min expiry)-------->|                       |
  |                            |<--- presigned URL -------|                       |
  |                            |                          |                       |
  |                            |  5. Insert file record   |                       |
  |                            |     (status: 'uploading')|------- INSERT ------->|
  |                            |                          |                       |
  |  6. Return presigned URL   |                          |                       |
  |     + file record ID       |                          |                       |
  |<---------------------------|                          |                       |
  |                            |                          |                       |
  |  7. PUT file directly to S3|                          |                       |
  |     (with Content-Type     |                          |                       |
  |      matching presigned)   |                          |                       |
  |----------------------------------------------->|      |                       |
  |<----------- 200 OK ----------------------------|      |                       |
  |                            |                          |                       |
  |  8. POST /api/files/confirm|                          |                       |
  |     { fileId }             |                          |                       |
  |--------------------------->|                          |                       |
  |                            |  9. HeadObject to verify |                       |
  |                            |---(confirm exists)------>|                       |
  |                            |<--- 200 + metadata ------|                       |
  |                            |                          |                       |
  |                            | 10. Update file status   |                       |
  |                            |     to 'active', log     |                       |
  |                            |     activity, send       |------- UPDATE ------->|
  |                            |     notification email   |------- INSERT log --->|
  |                            |                          |                       |
  | 11. Return confirmed file  |                          |                       |
  |<---------------------------|                          |                       |
```

### Why the Confirm Step Matters

The two-phase upload (request presigned URL + confirm after upload) prevents orphaned file records. If the user's browser closes mid-upload, the file record stays in `uploading` status and can be cleaned up by a periodic job. Without confirmation, you would have `active` file records pointing to non-existent S3 objects.

### End-to-End Download Flow

```
Browser                     Next.js API                  S3                    PostgreSQL
  |                            |                          |                       |
  |  1. GET /api/files/{id}/   |                          |                       |
  |     download               |                          |                       |
  |--------------------------->|                          |                       |
  |                            |  2. Validate:            |                       |
  |                            |     - user authenticated |                       |
  |                            |     - has access to deal |                       |
  |                            |     - has access to      |                       |
  |                            |       folder containing  |                       |
  |                            |       this file          |                       |
  |                            |                          |                       |
  |                            |  3. GetObject presigned  |                       |
  |                            |---(15min expiry)-------->|                       |
  |                            |<--- presigned URL -------|                       |
  |                            |                          |                       |
  |                            |  4. Log download activity|                       |
  |                            |     (append-only)        |------- INSERT log --->|
  |                            |                          |                       |
  |  5. 302 Redirect to       |                          |                       |
  |     presigned URL          |                          |                       |
  |<---------------------------|                          |                       |
  |                            |                          |                       |
  |  6. GET file from S3       |                          |                       |
  |----------------------------------------------->|      |                       |
  |<----------- file bytes -------------------------|      |                       |
```

**Download returns a redirect (302)** to the presigned URL rather than the URL in a JSON response. This enables direct browser downloads with proper filename via Content-Disposition header set on the S3 object at upload time.

---

## Data Flow: Authorization & Permission Checks

### Three-Layer Authorization Model

```
Layer 1: Middleware (middleware.ts)
  - Runs on EVERY request (Edge Runtime)
  - Checks: Is there a valid JWT session cookie?
  - Action: No session → redirect to /login
  - Does NOT check deal-level or folder-level permissions
  - Lightweight: only JWT verification, no DB calls

Layer 2: Server Components / Route Handlers (per-request)
  - Runs on specific page loads and API calls
  - Checks: Does this user have access to THIS deal?
  - Query: SELECT from deal_participants WHERE user_id = ? AND deal_id = ?
  - Returns 404 (not 403) for deals user can't access (information hiding)

Layer 3: Server Actions / API Route Handlers (per-mutation)
  - Runs on specific write operations
  - Checks: Does this user's role allow THIS action on THIS resource?
  - Example: Can this Client-role user upload to this folder?
  - Most granular: folder-level permission checks
```

### Why This Layering

| Concern | Where Checked | Why There |
|---------|--------------|-----------|
| Is user logged in? | Middleware | Runs before any page renders; cheap JWT check; no DB needed |
| Can user see this deal? | Server Component / Route Handler | Requires DB query; middleware can't do DB calls efficiently in Edge |
| Can user perform this action? | Server Action / Route Handler | Write operations need the most granular check; combines role + folder access |

### Permission Matrix

```typescript
// /lib/permissions.ts
type Role = 'admin' | 'cis_team' | 'client' | 'counsel' | 'buyer_rep' | 'view_only';

type Permission =
  | 'deal:create'        // Create new deal rooms
  | 'deal:edit'          // Edit deal name, status, client
  | 'deal:delete'        // Delete deal room
  | 'folder:create'      // Create folders
  | 'folder:rename'      // Rename folders
  | 'folder:delete'      // Delete folders
  | 'file:upload'        // Upload files to permitted folders
  | 'file:download'      // Download files from permitted folders
  | 'file:delete'        // Delete files
  | 'participant:invite' // Invite new participants
  | 'participant:remove' // Remove participants
  | 'participant:edit'   // Change role/folder access
  | 'activity:view';     // View activity log

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin:      ['deal:create', 'deal:edit', 'deal:delete', 'folder:create',
               'folder:rename', 'folder:delete', 'file:upload', 'file:download',
               'file:delete', 'participant:invite', 'participant:remove',
               'participant:edit', 'activity:view'],
  cis_team:   ['folder:create', 'folder:rename', 'file:upload', 'file:download',
               'file:delete', 'participant:invite', 'activity:view'],
  client:     ['file:upload', 'file:download', 'activity:view'],
  counsel:    ['file:upload', 'file:download', 'activity:view'],
  buyer_rep:  ['file:upload', 'file:download', 'activity:view'],
  view_only:  ['file:download', 'activity:view'],
};

// Folder access is a SEPARATE check layered on top of role permissions.
// A Client with file:upload permission can only upload to folders they
// were granted access to in their deal_participants record.
```

### Authorization Helper Pattern

```typescript
// /lib/auth.ts
export async function requireDealAccess(dealId: string) {
  const session = await getSession();
  if (!session) redirect('/login');

  const participant = await db.query.dealParticipants.findFirst({
    where: and(
      eq(dealParticipants.userId, session.sub),
      eq(dealParticipants.dealId, dealId),
      isNull(dealParticipants.revokedAt)  // not revoked
    ),
  });

  if (!participant) notFound();  // 404, not 403 — information hiding
  return { session, participant };
}

export async function requireFolderAccess(dealId: string, folderId: string) {
  const { session, participant } = await requireDealAccess(dealId);

  // Admin and cis_team have access to all folders
  if (['admin', 'cis_team'].includes(participant.role)) {
    return { session, participant };
  }

  // Others need explicit folder access
  const hasAccess = participant.folderAccess.includes(folderId);
  if (!hasAccess) notFound();

  return { session, participant };
}
```

---

## Database Schema Architecture

### Entity-Relationship Overview

```
users
  |
  +--< deal_participants >--+ deals
  |                          |   |
  |                          |   +--< folders
  |                          |   |     |
  |                          |   |     +--< files
  |                          |   |           |
  |                          |   +--< activity_log (append-only)
  |                          |
  +--< magic_links           +--< deal_status_history
```

### Table Definitions

```sql
-- All tables use UUID primary keys
-- All timestamps are timestamptz (UTC)

------------------------------------------------------
-- USERS
------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  global_role   TEXT NOT NULL DEFAULT 'external'
                  CHECK (global_role IN ('admin', 'cis_team', 'external')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- global_role determines what the user can do across the platform:
--   admin: CIS Partners admin (Rob) — can create deals, manage everything
--   cis_team: CIS Partners staff — can manage deals they're added to
--   external: clients, counsel, buyer reps — only see deals they're invited to

CREATE INDEX idx_users_email ON users(email);

------------------------------------------------------
-- MAGIC LINKS
------------------------------------------------------
CREATE TABLE magic_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL,  -- sha256 hash of the token, NEVER store raw
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,   -- NULL = unused, set on verification
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- Cleanup: DELETE WHERE expires_at < now() - interval '1 day'
-- Run daily via Vercel Cron or pg_cron

------------------------------------------------------
-- DEALS
------------------------------------------------------
CREATE TABLE deals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename      TEXT NOT NULL,           -- "Project Apollo"
  client_name   TEXT,                    -- visible to admin only
  status        TEXT NOT NULL DEFAULT 'engagement'
                  CHECK (status IN ('engagement', 'active_dd', 'ioi_stage',
                                     'closing', 'closed', 'archived')),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_status ON deals(status);

------------------------------------------------------
-- FOLDERS
------------------------------------------------------
CREATE TABLE folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,  -- for consistent sort
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(deal_id, name)  -- no duplicate folder names per deal
);

CREATE INDEX idx_folders_deal ON folders(deal_id);

------------------------------------------------------
-- FILES
------------------------------------------------------
CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  folder_id     UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,            -- original filename
  s3_key        TEXT NOT NULL UNIQUE,     -- full S3 object key
  size_bytes    BIGINT NOT NULL,
  content_type  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'uploading'
                  CHECK (status IN ('uploading', 'active', 'deleted')),
  version       INT NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES files(id),  -- linked list for versions
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ              -- soft delete
);

CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_deal ON files(deal_id);
CREATE INDEX idx_files_status ON files(status) WHERE status = 'active';
CREATE INDEX idx_files_name_folder ON files(name, folder_id)
  WHERE status = 'active';  -- for duplicate detection

-- S3 key structure: deals/{dealId}/{folderId}/{fileId}/{sanitized-name}
-- The fileId in the path prevents collisions; sanitized-name is for readability

------------------------------------------------------
-- DEAL PARTICIPANTS (junction table with role + folder access)
------------------------------------------------------
CREATE TABLE deal_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL
                  CHECK (role IN ('admin', 'cis_team', 'client', 'counsel',
                                   'buyer_rep', 'view_only')),
  folder_access UUID[] NOT NULL DEFAULT '{}',  -- array of folder UUIDs
                -- empty array = no folder restriction (admin/cis_team)
                -- non-empty = can only access listed folders
  invited_by    UUID REFERENCES users(id),
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,             -- NULL = active, set to revoke

  UNIQUE(deal_id, user_id)  -- one participation per user per deal
);

CREATE INDEX idx_deal_participants_deal ON deal_participants(deal_id);
CREATE INDEX idx_deal_participants_user ON deal_participants(user_id);
CREATE INDEX idx_deal_participants_active ON deal_participants(deal_id, user_id)
  WHERE revoked_at IS NULL;

------------------------------------------------------
-- ACTIVITY LOG (append-only — the most critical table for audit)
------------------------------------------------------
CREATE TABLE activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id),
  actor_id      UUID NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL
                  CHECK (action IN (
                    'file_uploaded', 'file_downloaded', 'file_deleted',
                    'file_viewed',
                    'folder_created', 'folder_renamed', 'folder_deleted',
                    'participant_invited', 'participant_removed',
                    'participant_role_changed',
                    'deal_created', 'deal_status_changed',
                    'deal_settings_changed'
                  )),
  target_type   TEXT,           -- 'file', 'folder', 'participant', 'deal'
  target_id     UUID,           -- ID of the affected entity
  metadata      JSONB,          -- action-specific details (e.g., old/new filename)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRITICAL: This table is append-only. Enforce via:
-- 1. Application layer: no UPDATE/DELETE queries against this table
-- 2. Database layer: revoke UPDATE, DELETE privileges from the app role
-- 3. Optional: CREATE RULE to block UPDATE/DELETE (see below)

CREATE INDEX idx_activity_log_deal ON activity_log(deal_id);
CREATE INDEX idx_activity_log_deal_time ON activity_log(deal_id, created_at DESC);
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id);

-- Enforce append-only at database level:
CREATE RULE activity_log_no_update AS ON UPDATE TO activity_log DO INSTEAD NOTHING;
CREATE RULE activity_log_no_delete AS ON DELETE TO activity_log DO INSTEAD NOTHING;

-- Alternative: Use a BEFORE UPDATE/DELETE trigger that raises an exception.
-- Rules are simpler but triggers give better error messages.
```

### Folder Access Model Explained

The `folder_access UUID[]` column on `deal_participants` uses a PostgreSQL array:

- **Admin / CIS Team:** `folder_access = '{}'` (empty array) means "all folders" -- they are not restricted
- **Client / Counsel / Buyer Rep / View Only:** `folder_access = '{uuid1, uuid2, uuid3}'` -- they can only see/interact with these specific folders
- When a new folder is created, the admin must explicitly grant access to participants who should see it
- When checking access: `folder_access = '{}' OR folderId = ANY(folder_access)`

This is simpler than a separate `folder_permissions` junction table and works well given that deals have at most ~10 folders and ~10-20 participants.

### File Versioning Model

File versioning uses a **linked list** approach via `previous_version_id`:

```
File "Q1 Report.pdf" v3 (active)
  └── previous_version_id → File "Q1 Report.pdf" v2 (active, but superseded)
       └── previous_version_id → File "Q1 Report.pdf" v1 (active, but superseded)
```

**Duplicate detection** at upload time: query `files` for same `name` + `folder_id` where `status = 'active'`. If found, prompt user to upload as new version (incrementing `version`, setting `previous_version_id` to existing file's ID).

---

## Activity Log: Append-Only Implementation

### Defense in Depth

The activity log must be truly immutable once written. Enforce at multiple levels:

**Level 1 -- Application Code:**
```typescript
// /lib/activity.ts — the ONLY way to write activity logs
export async function logActivity(params: {
  dealId: string;
  actorId: string;
  action: ActivityAction;
  targetType?: 'file' | 'folder' | 'participant' | 'deal';
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  // INSERT only — never expose update/delete functions
  await db.insert(activityLog).values({
    dealId: params.dealId,
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata,
    createdAt: new Date(),
  });
}

// No updateActivity or deleteActivity functions exist.
```

**Level 2 -- Database Rules (PostgreSQL):**
```sql
-- Block any UPDATE or DELETE at the database level
CREATE RULE activity_log_no_update AS ON UPDATE TO activity_log DO INSTEAD NOTHING;
CREATE RULE activity_log_no_delete AS ON DELETE TO activity_log DO INSTEAD NOTHING;
```

**Level 3 -- Database Role Permissions:**
```sql
-- Create a restricted role for the application
CREATE ROLE app_user;
GRANT SELECT, INSERT ON activity_log TO app_user;
-- Explicitly do NOT grant UPDATE or DELETE
```

**Level 4 -- Metadata captures before/after state:**
```typescript
// When logging a status change, capture the transition:
await logActivity({
  dealId,
  actorId: session.sub,
  action: 'deal_status_changed',
  targetType: 'deal',
  targetId: dealId,
  metadata: {
    from: 'engagement',
    to: 'active_dd',
  },
});
```

---

## API Endpoint Surface Area

### Authentication

| Method | Path | Purpose | Auth Required |
|--------|------|---------|---------------|
| POST | `/api/auth/magic-link` | Send magic link email | No |
| GET | `/api/auth/verify` | Verify token, create session | No (token in query) |
| POST | `/api/auth/logout` | Clear session cookie | Yes |
| GET | `/api/auth/session` | Return current session info | Yes |

### Deals

| Method | Path | Purpose | Auth Required | Permission |
|--------|------|---------|---------------|------------|
| GET | `/api/deals` | List user's deals | Yes | Any participant |
| POST | `/api/deals` | Create new deal | Yes | `deal:create` |
| GET | `/api/deals/[dealId]` | Get deal details | Yes | Deal participant |
| PATCH | `/api/deals/[dealId]` | Update deal (name, status) | Yes | `deal:edit` |
| DELETE | `/api/deals/[dealId]` | Delete deal | Yes | `deal:delete` |

### Folders

| Method | Path | Purpose | Auth Required | Permission |
|--------|------|---------|---------------|------------|
| GET | `/api/deals/[dealId]/folders` | List folders (filtered by access) | Yes | Deal participant |
| POST | `/api/deals/[dealId]/folders` | Create folder | Yes | `folder:create` |
| PATCH | `/api/deals/[dealId]/folders/[folderId]` | Rename folder | Yes | `folder:rename` |
| DELETE | `/api/deals/[dealId]/folders/[folderId]` | Delete folder | Yes | `folder:delete` |

### Files

| Method | Path | Purpose | Auth Required | Permission |
|--------|------|---------|---------------|------------|
| GET | `/api/deals/[dealId]/folders/[folderId]/files` | List files in folder | Yes | Folder access |
| POST | `/api/files/upload` | Request presigned upload URL | Yes | `file:upload` + folder access |
| POST | `/api/files/confirm` | Confirm upload completed | Yes | `file:upload` (same user who requested) |
| GET | `/api/files/[fileId]/download` | Get presigned download URL (302 redirect) | Yes | `file:download` + folder access |
| DELETE | `/api/files/[fileId]` | Soft-delete file | Yes | `file:delete` |
| GET | `/api/files/[fileId]/versions` | List file version history | Yes | Folder access |

### Participants

| Method | Path | Purpose | Auth Required | Permission |
|--------|------|---------|---------------|------------|
| GET | `/api/deals/[dealId]/participants` | List participants | Yes | Deal participant |
| POST | `/api/deals/[dealId]/participants` | Invite participant | Yes | `participant:invite` |
| PATCH | `/api/deals/[dealId]/participants/[id]` | Update role/folder access | Yes | `participant:edit` |
| DELETE | `/api/deals/[dealId]/participants/[id]` | Revoke access | Yes | `participant:remove` |

### Activity

| Method | Path | Purpose | Auth Required | Permission |
|--------|------|---------|---------------|------------|
| GET | `/api/deals/[dealId]/activity` | Get activity log (paginated) | Yes | `activity:view` |

### Total: ~18 endpoints

---

## S3 Bucket Configuration

### Bucket Structure

```
cis-deal-room-files/
  deals/
    {dealId}/
      {folderId}/
        {fileId}/
          {sanitized-filename}
```

### Key Configuration

```json
{
  "BlockPublicAccess": {
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  },
  "ServerSideEncryption": {
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  },
  "CORSConfiguration": {
    "CORSRules": [{
      "AllowedOrigins": ["https://deals.cispartners.co"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["Content-Type", "Content-Length"],
      "MaxAgeSeconds": 3600
    }]
  },
  "LifecycleRules": [{
    "Id": "cleanup-failed-uploads",
    "Filter": { "Prefix": "deals/" },
    "AbortIncompleteMultipartUpload": {
      "DaysAfterInitiation": 1
    }
  }]
}
```

### IAM Policy for Presigned URL Generation

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::cis-deal-room-files/deals/*"
    }
  ]
}
```

---

## Patterns to Follow

### Pattern 1: Colocate Authorization with Data Access

**What:** Every function that reads or writes deal/folder/file data should start with an authorization check. Never separate "check permission" from "do the thing."

**When:** Every server action, route handler, and server component that accesses deal data.

**Example:**
```typescript
// GOOD: Auth check is the first line, returns the participant context
export async function getDealFiles(dealId: string, folderId: string) {
  const { participant } = await requireFolderAccess(dealId, folderId);
  // participant is guaranteed valid here
  return db.query.files.findMany({
    where: and(
      eq(files.folderId, folderId),
      eq(files.status, 'active')
    ),
    orderBy: desc(files.uploadedAt),
  });
}

// BAD: Auth check in middleware, data access in a different function
// with no guarantee they reference the same deal/folder
```

### Pattern 2: Log Activity as Side Effect of Mutations

**What:** Every mutation (upload, download, invite, status change) writes to the activity log in the same transaction or immediately after.

**When:** Every server action that modifies state.

**Example:**
```typescript
export async function inviteParticipant(dealId: string, data: InviteData) {
  const { session } = await requireDealAccess(dealId);
  requirePermission(session, 'participant:invite');

  const result = await db.transaction(async (tx) => {
    // Create or find user
    const user = await findOrCreateUser(tx, data.email);

    // Create participation record
    const participant = await tx.insert(dealParticipants).values({
      dealId,
      userId: user.id,
      role: data.role,
      folderAccess: data.folderIds,
      invitedBy: session.sub,
    }).returning();

    // Log in same transaction
    await tx.insert(activityLog).values({
      dealId,
      actorId: session.sub,
      action: 'participant_invited',
      targetType: 'participant',
      targetId: participant[0].id,
      metadata: { email: data.email, role: data.role },
    });

    return participant[0];
  });

  // Send invite email (outside transaction — email is not transactional)
  await sendDealInviteEmail(data.email, dealId);

  return result;
}
```

### Pattern 3: Use Server Actions for Mutations, Route Handlers for External Integrations

**What:** Server Actions (in `/lib/actions/`) handle form submissions and UI-driven mutations. Route Handlers (`/app/api/`) handle presigned URL generation and any operations that need a raw HTTP response (redirects, streaming).

**When:** Choosing between server actions and route handlers.

**Why:**
- Server Actions integrate cleanly with React forms, `useTransition`, and `revalidatePath`
- Route Handlers are needed when you must return a non-React response (302 redirect for download, raw JSON for presigned URL with specific headers)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Passing Presigned URLs Through State

**What:** Storing presigned URLs in React state or URL params and reusing them later.

**Why bad:** Presigned URLs expire (15 min). If stored in state and used after expiry, downloads fail silently. Users see broken downloads.

**Instead:** Generate a fresh presigned URL on every download request. The download API endpoint should generate and redirect in one step.

### Anti-Pattern 2: Client-Side Permission Checks

**What:** Hiding UI elements based on role without also checking on the server.

**Why bad:** UI hiding is a convenience, not security. Users can call API endpoints directly. Every API endpoint must independently verify permissions.

**Instead:** Check permissions in the server action/route handler. Use client-side role info only for UI rendering (hide the "Delete" button for view-only users), but always enforce on the server.

### Anti-Pattern 3: Large File Uploads Through the App Server

**What:** Receiving file uploads in a Next.js API route and then forwarding to S3.

**Why bad:** Vercel serverless functions have a ~4.5MB body size limit on the free tier and 50MB on Pro. The spec requires 500MB files. Even if the limit were higher, proxying wastes bandwidth and doubles latency.

**Instead:** Always use presigned URLs. The browser uploads directly to S3. The app server only generates the URL and confirms the upload.

### Anti-Pattern 4: Mutable Activity Logs

**What:** Allowing UPDATE or DELETE on the activity_log table, even "just for corrections."

**Why bad:** Destroys audit integrity. If someone can edit logs, they can cover tracks.

**Instead:** If a log entry is wrong, add a new "correction" entry that references the original. Never modify or delete existing entries.

---

## Directory Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx          # Email input form
│   │   └── verify/
│   │       └── page.tsx          # "Check your email" + verify handler
│   ├── (portal)/
│   │   ├── layout.tsx            # Authenticated shell (header, user context)
│   │   ├── deals/
│   │   │   ├── page.tsx          # Deal list (home screen)
│   │   │   └── [dealId]/
│   │   │       ├── page.tsx      # Three-panel workspace
│   │   │       └── settings/
│   │   │           └── page.tsx  # Deal settings (admin only)
│   │   └── admin/
│   │       └── page.tsx          # User/system admin (admin only)
│   ├── api/
│   │   ├── auth/
│   │   │   ├── magic-link/route.ts
│   │   │   ├── verify/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── session/route.ts
│   │   ├── deals/
│   │   │   ├── route.ts                           # GET (list), POST (create)
│   │   │   └── [dealId]/
│   │   │       ├── route.ts                       # GET, PATCH, DELETE
│   │   │       ├── folders/route.ts               # GET, POST
│   │   │       ├── folders/[folderId]/route.ts    # PATCH, DELETE
│   │   │       ├── participants/route.ts          # GET, POST
│   │   │       ├── participants/[id]/route.ts     # PATCH, DELETE
│   │   │       └── activity/route.ts              # GET
│   │   └── files/
│   │       ├── upload/route.ts                    # POST (get presigned URL)
│   │       ├── confirm/route.ts                   # POST (confirm upload)
│   │       └── [fileId]/
│   │           ├── download/route.ts              # GET (presigned redirect)
│   │           ├── route.ts                       # DELETE
│   │           └── versions/route.ts              # GET
│   └── layout.tsx                # Root layout (fonts, metadata)
├── components/
│   ├── ui/                       # Design system primitives
│   ├── deals/                    # Deal list cards
│   ├── workspace/                # Three-panel layout components
│   │   ├── folder-sidebar.tsx
│   │   ├── file-list.tsx
│   │   ├── activity-panel.tsx
│   │   └── participant-panel.tsx
│   ├── modals/
│   │   ├── upload-modal.tsx
│   │   └── invite-modal.tsx
│   └── auth/
│       └── login-form.tsx
├── lib/
│   ├── auth.ts                   # JWT helpers, getSession, requireAuth
│   ├── permissions.ts            # Role-permission matrix, check helpers
│   ├── s3.ts                     # S3 client, presigned URL generation
│   ├── email.ts                  # Resend client, email templates
│   ├── activity.ts               # logActivity helper (insert-only)
│   ├── db/
│   │   ├── index.ts              # Drizzle client connection
│   │   ├── schema.ts             # All table definitions
│   │   └── migrations/           # SQL migration files
│   └── actions/
│       ├── deals.ts              # Server actions: create, update deal
│       ├── folders.ts            # Server actions: create, rename, delete folder
│       ├── files.ts              # Server actions: delete file
│       └── participants.ts       # Server actions: invite, update, revoke
├── middleware.ts                  # Auth gate: JWT check, redirect to /login
└── types/
    └── index.ts                  # Shared TypeScript types
```

---

## Suggested Build Order

The components have dependencies that dictate build sequence:

```
Phase 1: Foundation (everything else depends on this)
  ├── Database schema + migrations
  ├── Auth module (magic link flow end-to-end)
  ├── Middleware (session check)
  └── Basic layout shell

Phase 2: Core Data (deals + folders — the structure everything hangs on)
  ├── Deal CRUD (API + UI)
  ├── Folder CRUD (API + UI)
  ├── Default folder auto-creation
  └── Permission system (role checks)

Phase 3: File Operations (depends on deals + folders + permissions)
  ├── S3 presigned URL upload flow
  ├── Upload confirmation flow
  ├── Download via presigned URL redirect
  ├── File listing with folder filtering
  └── Duplicate detection + versioning

Phase 4: Collaboration (depends on deals + auth)
  ├── Participant invite flow (with Resend email)
  ├── Folder access control per participant
  ├── Revoke access
  └── Activity log (integrated into mutations)

Phase 5: Polish (depends on everything above)
  ├── Activity panel UI
  ├── Email notifications (upload alerts)
  ├── Search/filter within folders
  ├── Responsive collapse behavior
  └── Error handling + edge cases
```

**Key dependency insight:** Auth must be first because every other endpoint requires it. Deals and folders must be second because files belong to folders which belong to deals. File operations come third because they are the core value but depend on the deal/folder structure. Collaboration (invites) is fourth because the system works for a single admin without invites, but invites require the permission system which is built alongside deals.

---

## Scalability Considerations

| Concern | At 10 deals (now) | At 100 deals | At 1000+ deals |
|---------|-------------------|--------------|----------------|
| Activity log size | No concern | Add pagination (cursor-based) | Partition by deal_id or created_at |
| File listing | No concern | Already scoped to folder | Add cursor pagination if 100+ files per folder |
| Deal list | Load all | Load all (still small) | Paginate + search |
| S3 costs | Minimal | Moderate | Consider S3 Intelligent-Tiering for old deals |
| Auth tokens | Single table | Add cleanup cron | Same (expired tokens are tiny rows) |

**Current scale:** CIS Partners has a small number of active deals at any time (likely <20). Architecture optimizes for developer speed and correctness over horizontal scale. PostgreSQL on Neon handles this scale trivially.

---

## Security Boundaries Summary

```
INTERNET
    │
    ▼
[HTTPS only — Vercel enforces TLS]
    │
    ▼
[middleware.ts — JWT validation]
    │  Unauthenticated → /login
    ▼
[Route Handler / Server Component]
    │  No deal access → 404
    ▼
[Permission Check]
    │  Insufficient role → 403
    ▼
[Folder Access Check]
    │  No folder access → 404
    ▼
[Action Execution + Activity Log]
    │
    ├──→ [S3 presigned URL — 15 min, CORS-locked]
    └──→ [PostgreSQL — role-restricted queries]
```

**Information hiding principle:** Users who lack access to a deal see a 404, not a 403. This prevents enumeration of deal IDs and leaking the existence of confidential deals.

---

## Sources

- AWS S3 Presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html (HIGH confidence -- verified via official docs)
- AWS S3 Presigned Upload: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html (HIGH confidence -- verified via official docs)
- Auth.js v5 / NextAuth.js: Based on training data knowledge of Auth.js v5 patterns (MEDIUM confidence -- verify current API during implementation)
- Next.js App Router middleware and authorization: Based on training data knowledge of Next.js 14/15 patterns (MEDIUM confidence -- verify current middleware API)
- PostgreSQL append-only patterns: Based on established PostgreSQL patterns for audit logging (HIGH confidence -- well-established pattern)
- jose library for JWT in Edge Runtime: Based on training data (HIGH confidence -- jose is the standard for Edge-compatible JWT)
