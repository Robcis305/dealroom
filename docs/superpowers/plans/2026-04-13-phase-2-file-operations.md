# Phase 2: File Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can upload files via drag-and-drop directly to S3 via presigned URLs, download files via time-limited presigned URLs, and see a live file list in the workspace center panel — with all actions logged to the activity table.

**Architecture:** The browser never touches the app server for file bytes. The API issues presigned S3 URLs (PutObject for upload, GetObject for download); the browser transacts directly with S3. On upload completion the browser calls `/api/files/confirm` which writes the DB record and activity log entry. When S3 credentials are absent (`AWS_S3_BUCKET` unset), routes return stub responses so all code paths are exercisable without real AWS.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · Neon PostgreSQL · `@aws-sdk/client-s3` (already installed) · `@aws-sdk/s3-request-presigner` (already installed) · `react-dropzone` (install in Task 8) · Vitest · `@testing-library/react`

---

## File Map

| Action | Path |
|---|---|
| Modify | `cis-deal-room/src/db/schema.ts` |
| Create | `cis-deal-room/src/lib/dal/files.ts` |
| Create | `cis-deal-room/src/app/api/files/presign-upload/route.ts` |
| Create | `cis-deal-room/src/app/api/files/confirm/route.ts` |
| Create | `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts` |
| Create | `cis-deal-room/src/app/api/files/[id]/route.ts` |
| Create | `cis-deal-room/src/components/workspace/FileList.tsx` |
| Create | `cis-deal-room/src/components/workspace/UploadModal.tsx` |
| Modify | `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` |
| Create | `cis-deal-room/src/test/files/files-dal.test.ts` |
| Create | `cis-deal-room/src/test/files/presign-upload.test.ts` |
| Create | `cis-deal-room/src/test/files/presign-download.test.ts` |

---

## Task 1: Add `files` table to schema and migrate

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts`

- [ ] **Step 1: Add the `files` table to schema.ts**

Open `cis-deal-room/src/db/schema.ts`. After the `folderAccess` table definition (line ~133) and before the `activityLogs` table, insert:

```typescript
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id')
    .notNull()
    .references(() => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  s3Key: text('s3_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  version: integer('version').notNull().default(1),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // No updatedAt — file rows are immutable once confirmed. Versioning creates new rows.
});
```

- [ ] **Step 2: Generate the Drizzle migration**

```bash
cd cis-deal-room && npx drizzle-kit generate
```

Expected: a new file appears in `src/db/migrations/` with a `CREATE TABLE files` statement.

- [ ] **Step 3: Apply the migration**

```bash
cd cis-deal-room && npx drizzle-kit migrate
```

Expected: `[✓] Migrations applied` with no errors. If `DATABASE_URL` is not set in your environment, set it first: `export DATABASE_URL=<your-neon-connection-string>`.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/db/schema.ts src/db/migrations/ && git commit -m "feat(schema): add files table with versioning support"
```

---

## Task 2: Files DAL

**Files:**
- Create: `cis-deal-room/src/lib/dal/files.ts`
- Create: `cis-deal-room/src/test/files/files-dal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/files/files-dal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/db', () => ({
  db: {
    insert: () => ({ values: mockInsert }),
    select: mockSelect,
    update: () => ({ set: () => ({ where: mockUpdate }) }),
    delete: () => ({ where: mockDelete }),
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
  getFilesForFolder,
  getFileById,
  checkDuplicate,
  createFile,
  deleteFile,
} from '@/lib/dal/files';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

describe('getFilesForFolder', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(getFilesForFolder('folder-1')).rejects.toThrow('Unauthorized');
  });

  it('queries files for the given folderId ordered by createdAt desc', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const rows = [{ id: 'f1', name: 'report.pdf', version: 1 }];
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue(rows) };
    mockSelect.mockReturnValue(chain);
    const result = await getFilesForFolder('folder-1');
    expect(result).toEqual(rows);
  });
});

describe('checkDuplicate', () => {
  it('returns null when no file exists with that name in the folder', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValue(chain);
    const result = await checkDuplicate('folder-1', 'report.pdf');
    expect(result).toBeNull();
  });

  it('returns the existing file when a duplicate exists', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const existing = { id: 'f1', name: 'report.pdf', version: 2 };
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([existing]) };
    mockSelect.mockReturnValue(chain);
    const result = await checkDuplicate('folder-1', 'report.pdf');
    expect(result).toEqual(existing);
  });
});

describe('createFile', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' })).rejects.toThrow('Unauthorized');
  });

  it('inserts a file row and returns it', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const newFile = { id: 'file-1', folderId: 'f1', name: 'x.pdf', version: 1 };
    mockInsert.mockResolvedValue([newFile]);
    const result = await createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k/x.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' });
    expect(result).toEqual(newFile);
  });

  it('sets version to previousVersion + 1 when a duplicate exists', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const newFile = { id: 'file-2', folderId: 'f1', name: 'x.pdf', version: 3 };
    mockInsert.mockResolvedValue([newFile]);
    const result = await createFile({ folderId: 'f1', name: 'x.pdf', s3Key: 'k/x-v3.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1', previousVersion: 2 });
    expect(result.version).toBe(3);
  });
});

describe('deleteFile', () => {
  it('throws Unauthorized when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(deleteFile('file-1')).rejects.toThrow('Unauthorized');
  });

  it('throws Admin required when non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue({ ...mockSession, isAdmin: false });
    const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: 'file-1' }]) };
    mockSelect.mockReturnValue(chain);
    await expect(deleteFile('file-1')).rejects.toThrow('Admin required');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/files/files-dal.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dal/files'`

- [ ] **Step 3: Create the files DAL**

Create `cis-deal-room/src/lib/dal/files.ts`:

```typescript
import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns all latest-version files for a folder ordered newest-first.
 * Requires an authenticated session.
 */
export async function getFilesForFolder(folderId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db
    .select()
    .from(files)
    .where(eq(files.folderId, folderId))
    .orderBy(desc(files.createdAt));
}

/**
 * Returns a single file row by ID, or null if not found.
 */
export async function getFileById(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  return file ?? null;
}

/**
 * Returns the most recent existing file with the same name in the folder, or null.
 * Used for duplicate detection before issuing a presigned upload URL.
 */
export async function checkDuplicate(folderId: string, name: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [existing] = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.name, name)))
    .orderBy(desc(files.version))
    .limit(1);

  return existing ?? null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Inserts a confirmed file row and logs the 'uploaded' activity.
 * Pass previousVersion when re-uploading an existing filename (versioning).
 */
export async function createFile(input: {
  folderId: string;
  name: string;
  s3Key: string;
  sizeBytes: number;
  mimeType: string;
  workspaceId: string;
  previousVersion?: number;
}) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const version = input.previousVersion != null ? input.previousVersion + 1 : 1;

  const [file] = await db
    .insert(files)
    .values({
      folderId: input.folderId,
      name: input.name,
      s3Key: input.s3Key,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      version,
      uploadedBy: session.userId,
    })
    .returning();

  await logActivity(db, {
    workspaceId: input.workspaceId,
    userId: session.userId,
    action: 'uploaded',
    targetType: 'file',
    targetId: file.id,
    metadata: { fileName: input.name, folderId: input.folderId, version },
  });

  return file;
}

/**
 * Deletes a file row by ID and logs the 'deleted' activity.
 * Fetches the file first to get workspaceId (via folder join) for the activity log.
 * Admin-only. Does NOT delete the S3 object — the route handler does that.
 */
export async function deleteFile(fileId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  // Fetch file + folder to get workspaceId
  const [row] = await db
    .select({ file: files, folder: folders })
    .from(files)
    .innerJoin(folders, eq(files.folderId, folders.id))
    .where(eq(files.id, fileId))
    .limit(1);

  if (!row) throw new Error('File not found');
  if (!session.isAdmin) throw new Error('Admin required');

  await db.delete(files).where(eq(files.id, fileId));

  await logActivity(db, {
    workspaceId: row.folder.workspaceId,
    userId: session.userId,
    action: 'deleted',
    targetType: 'file',
    targetId: fileId,
    metadata: { fileName: row.file.name },
  });

  return row.file;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/files/files-dal.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/lib/dal/files.ts src/test/files/files-dal.test.ts && git commit -m "feat(dal): add files DAL with versioning and duplicate detection"
```

---

## Task 3: Presign-upload API route

**Files:**
- Create: `cis-deal-room/src/app/api/files/presign-upload/route.ts`
- Create: `cis-deal-room/src/test/files/presign-upload.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/files/presign-upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  checkDuplicate: vi.fn(),
}));

vi.mock('@/lib/storage/s3', () => ({
  getS3Client: vi.fn(() => ({})),
  S3_BUCKET: undefined,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { checkDuplicate } from '@/lib/dal/files';
import { POST } from '@/app/api/files/presign-upload/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

function makeRequest(body: object) {
  return new Request('http://localhost/api/files/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/files/presign-upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 100, workspaceId: 'w1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when file type is not allowed', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'virus.exe', mimeType: 'application/x-msdownload', sizeBytes: 100, workspaceId: 'w1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file type/i);
  });

  it('returns 400 when file exceeds 500MB', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 501 * 1024 * 1024, workspaceId: 'w1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/size/i);
  });

  it('returns duplicate:true when filename exists in folder', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue({ id: 'existing-file', version: 1 } as any);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000, workspaceId: 'w1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(body.existingFileId).toBe('existing-file');
  });

  it('returns stub response when AWS_S3_BUCKET is not set', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue(null);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1000, workspaceId: 'w1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presignedUrl).toBeNull();
    expect(body.s3Key).toMatch(/^stub\//);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/files/presign-upload.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/files/presign-upload/route'`

- [ ] **Step 3: Create the presign-upload route**

Create `cis-deal-room/src/app/api/files/presign-upload/route.ts`:

```typescript
import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifySession } from '@/lib/dal/index';
import { checkDuplicate } from '@/lib/dal/files';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/csv',
  'image/jpeg',
  'image/png',
  'video/mp4',
]);

const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const schema = z.object({
  folderId: z.string().uuid(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  workspaceId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { folderId, fileName, mimeType, sizeBytes, workspaceId } = parsed;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return Response.json({ error: 'File type not allowed' }, { status: 400 });
  }

  // Validate file size
  if (sizeBytes > MAX_SIZE_BYTES) {
    return Response.json({ error: 'File size exceeds 500 MB limit' }, { status: 400 });
  }

  // Duplicate detection — let the caller decide whether to version or cancel
  const existing = await checkDuplicate(folderId, fileName);
  if (existing) {
    return Response.json({
      duplicate: true,
      existingFileId: existing.id,
      existingVersion: existing.version,
    });
  }

  // S3 stub — return fake key when bucket is not configured
  if (!S3_BUCKET) {
    const s3Key = `stub/fake-key-${crypto.randomUUID()}`;
    return Response.json({ presignedUrl: null, s3Key, duplicate: false });
  }

  const s3Key = `workspaces/${workspaceId}/folders/${folderId}/${crypto.randomUUID()}-${fileName}`;

  const presignedUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      ServerSideEncryption: 'AES256',
    }),
    { expiresIn: 15 * 60 } // 15 minutes
  );

  return Response.json({ presignedUrl, s3Key, duplicate: false });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/files/presign-upload.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/files/presign-upload/route.ts src/test/files/presign-upload.test.ts && git commit -m "feat(api): add presign-upload route with type/size validation and stub support"
```

---

## Task 4: Confirm-upload API route

**Files:**
- Create: `cis-deal-room/src/app/api/files/confirm/route.ts`
- Create: `cis-deal-room/src/test/files/confirm.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/files/confirm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  createFile: vi.fn(),
  checkDuplicate: vi.fn(),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

import { verifySession } from '@/lib/dal/index';
import { createFile, checkDuplicate } from '@/lib/dal/files';
import { POST } from '@/app/api/files/confirm/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };

function makeRequest(body: object) {
  return new Request('http://localhost/api/files/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/files/confirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'x.pdf', s3Key: 'k', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' }));
    expect(res.status).toBe(401);
  });

  it('creates file record and returns 201 on success', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue(null);
    const newFile = { id: 'file-1', name: 'x.pdf', version: 1 };
    vi.mocked(createFile).mockResolvedValue(newFile as any);

    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'x.pdf', s3Key: 'k/x.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('file-1');
  });

  it('passes previousVersion when a duplicate was confirmed by the user', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(checkDuplicate).mockResolvedValue({ id: 'existing', version: 2 } as any);
    const newFile = { id: 'file-2', name: 'x.pdf', version: 3 };
    vi.mocked(createFile).mockResolvedValue(newFile as any);

    const res = await POST(makeRequest({ folderId: 'f1', fileName: 'x.pdf', s3Key: 'k/x-v3.pdf', sizeBytes: 100, mimeType: 'application/pdf', workspaceId: 'w1', confirmedVersioning: true }));
    expect(res.status).toBe(201);
    expect(vi.mocked(createFile)).toHaveBeenCalledWith(expect.objectContaining({ previousVersion: 2 }));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/files/confirm.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/files/confirm/route'`

- [ ] **Step 3: Create the confirm route**

Create `cis-deal-room/src/app/api/files/confirm/route.ts`:

```typescript
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { createFile, checkDuplicate } from '@/lib/dal/files';

const schema = z.object({
  folderId: z.string().uuid(),
  fileName: z.string().min(1),
  s3Key: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  workspaceId: z.string().uuid(),
  // true when the user acknowledged the duplicate warning and chose to version
  confirmedVersioning: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { folderId, fileName, s3Key, sizeBytes, mimeType, workspaceId, confirmedVersioning } = parsed;

  // Resolve previous version when the user chose to create a new version
  let previousVersion: number | undefined;
  if (confirmedVersioning) {
    const existing = await checkDuplicate(folderId, fileName);
    previousVersion = existing?.version;
  }

  const file = await createFile({
    folderId,
    name: fileName,
    s3Key,
    sizeBytes,
    mimeType,
    workspaceId,
    previousVersion,
  });

  return Response.json(file, { status: 201 });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/files/confirm.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/files/confirm/route.ts src/test/files/confirm.test.ts && git commit -m "feat(api): add confirm-upload route for post-S3 file record creation"
```

---

## Task 5: Presign-download API route

**Files:**
- Create: `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts`
- Create: `cis-deal-room/src/test/files/presign-download.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/files/presign-download.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/files', () => ({
  getFileById: vi.fn(),
}));

vi.mock('@/lib/storage/s3', () => ({
  getS3Client: vi.fn(() => ({})),
  S3_BUCKET: undefined,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));

vi.mock('@/db', () => ({ db: {} }));

import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { GET } from '@/app/api/files/[id]/presign-download/route';

const mockSession = { sessionId: 's1', userId: 'u1', userEmail: 'a@b.com', isAdmin: true };
const mockFile = { id: 'file-1', folderId: 'folder-1', name: 'report.pdf', s3Key: 'workspaces/w1/folders/f1/report.pdf', sizeBytes: 1000, mimeType: 'application/pdf', version: 1, uploadedBy: 'u2' };

function makeRequest(fileId: string) {
  return new Request(`http://localhost/api/files/${fileId}/presign-download`);
}

describe('GET /api/files/[id]/presign-download', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file does not exist', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(getFileById).mockResolvedValue(null);
    const res = await GET(makeRequest('nope'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns stub download URL when AWS_S3_BUCKET is not set', async () => {
    vi.mocked(verifySession).mockResolvedValue(mockSession);
    vi.mocked(getFileById).mockResolvedValue(mockFile as any);
    const res = await GET(makeRequest('file-1'), { params: Promise.resolve({ id: 'file-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^stub:\/\//);
    expect(body.fileName).toBe('report.pdf');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd cis-deal-room && npx vitest run src/test/files/presign-download.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/files/[id]/presign-download/route'`

- [ ] **Step 3: Create the presign-download route**

Create `cis-deal-room/src/app/api/files/[id]/presign-download/route.ts`:

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifySession } from '@/lib/dal/index';
import { getFileById } from '@/lib/dal/files';
import { logActivity } from '@/lib/dal/activity';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { db } from '@/db';
import { folders } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: fileId } = await params;

  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  // Resolve workspaceId for activity log
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, file.folderId))
    .limit(1);

  // S3 stub — return placeholder URL when bucket is not configured
  if (!S3_BUCKET) {
    await logActivity(db, {
      workspaceId: folder?.workspaceId ?? 'stub',
      userId: session.userId,
      action: 'downloaded',
      targetType: 'file',
      targetId: file.id,
      metadata: { fileName: file.name },
    });

    return Response.json({
      url: `stub://download/${file.s3Key}`,
      fileName: file.name,
    });
  }

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: file.s3Key,
      ResponseContentDisposition: `attachment; filename="${file.name}"`,
    }),
    { expiresIn: 15 * 60 } // 15 minutes
  );

  await logActivity(db, {
    workspaceId: folder.workspaceId,
    userId: session.userId,
    action: 'downloaded',
    targetType: 'file',
    targetId: file.id,
    metadata: { fileName: file.name },
  });

  return Response.json({ url, fileName: file.name });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd cis-deal-room && npx vitest run src/test/files/presign-download.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room && git add src/app/api/files/[id]/presign-download/route.ts src/test/files/presign-download.test.ts && git commit -m "feat(api): add presign-download route with 15-min expiry and activity logging"
```

---

## Task 6: File delete API route

**Files:**
- Create: `cis-deal-room/src/app/api/files/[id]/route.ts`

- [ ] **Step 1: Create the file DELETE route**

Create `cis-deal-room/src/app/api/files/[id]/route.ts`:

```typescript
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { verifySession } from '@/lib/dal/index';
import { getFileById, deleteFile } from '@/lib/dal/files';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: fileId } = await params;

  const file = await getFileById(fileId);
  if (!file) return Response.json({ error: 'File not found' }, { status: 404 });

  // Delete from S3 if bucket is configured
  if (S3_BUCKET) {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key })
    );
  }

  // Delete DB row + log activity (deleteFile DAL handles both)
  await deleteFile(fileId);

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Verify the route handles errors correctly by running all file tests**

```bash
cd cis-deal-room && npx vitest run src/test/files/
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/app/api/files/[id]/route.ts && git commit -m "feat(api): add file DELETE route for admin file removal"
```

---

## Task 7: FileList component

**Files:**
- Create: `cis-deal-room/src/components/workspace/FileList.tsx`

- [ ] **Step 1: Create the FileList component**

Create `cis-deal-room/src/components/workspace/FileList.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Sheet, Presentation, Image, Film, File, Download } from 'lucide-react';

interface FileRow {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  version: number;
  uploadedByEmail?: string;
  createdAt: string | Date;
}

interface FileListProps {
  folderId: string;
  folderName: string;
  isAdmin: boolean;
  onUpload: () => void;
  /** Incremented externally after a successful upload to trigger refetch */
  uploadRevision?: number;
}

function mimeToIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <FileText size={18} className="text-[#E10600]" />;
  if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return <Sheet size={18} className="text-green-400" />;
  if (mimeType.includes('presentation')) return <Presentation size={18} className="text-orange-400" />;
  if (mimeType.startsWith('image/')) return <Image size={18} className="text-blue-400" />;
  if (mimeType.startsWith('video/')) return <Film size={18} className="text-purple-400" />;
  return <File size={18} className="text-neutral-400" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FileList({ folderId, folderName, isAdmin, onUpload, uploadRevision = 0 }: FileListProps) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?folderId=${folderId}`);
      if (res.ok) setFiles(await res.json());
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { load(); }, [load, uploadRevision]);

  async function handleDownload(file: FileRow) {
    const res = await fetch(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = await res.json();
    if (url.startsWith('stub://')) {
      alert(`[Stub] Would download: ${file.name}`);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Loading files…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-4 shrink-0">
        <h2 className="text-lg font-semibold text-white tracking-tight">{folderName}</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm
              text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#E10600]"
          />
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 bg-[#E10600] hover:bg-[#C10500] text-white
              text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Upload
          </button>
        </div>
      </div>

      {/* File table */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500">
          <File size={32} />
          <p className="text-sm">
            {files.length === 0 ? 'No files yet — upload the first one' : 'No files match your search'}
          </p>
          {files.length === 0 && (
            <button
              onClick={onUpload}
              className="text-[#E10600] text-sm font-medium hover:underline"
            >
              Upload files
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_130px_120px_60px] gap-2 py-2 text-xs font-semibold
            uppercase tracking-wider text-neutral-500 border-b border-[#2A2A2A]">
            <span>File</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>By</span>
            <span />
          </div>

          {/* File rows */}
          {filtered.map((file) => (
            <div
              key={file.id}
              className="grid grid-cols-[1fr_80px_130px_120px_60px] gap-2 py-3 items-center
                border-b border-[#1A1A1A] hover:bg-[#161616] transition-colors group"
            >
              {/* Name + icon */}
              <div className="flex items-center gap-2.5 min-w-0">
                {mimeToIcon(file.mimeType)}
                <span className="text-sm text-white truncate font-medium">{file.name}</span>
                {file.version > 1 && (
                  <span className="shrink-0 text-[10px] font-mono bg-[#2A2A2A] text-neutral-400
                    px-1.5 py-0.5 rounded">
                    v{file.version}
                  </span>
                )}
              </div>

              {/* Size */}
              <span className="text-xs text-neutral-500 font-mono">{formatBytes(file.sizeBytes)}</span>

              {/* Date */}
              <span className="text-xs text-neutral-400">{formatDate(file.createdAt)}</span>

              {/* Uploader */}
              <span className="text-xs text-neutral-400 truncate">{file.uploadedByEmail ?? '—'}</span>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(file)}
                  title="Download"
                  className="p-1 text-neutral-500 hover:text-white transition-colors"
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the files GET route** (needed by FileList)

Create `cis-deal-room/src/app/api/files/route.ts`:

```typescript
import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { db } from '@/db';
import { users, files } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

const schema = z.object({ folderId: z.string().uuid() });

export async function GET(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = schema.safeParse({ folderId: url.searchParams.get('folderId') });
  if (!parsed.success) return Response.json({ error: 'folderId required' }, { status: 400 });

  try {
    // Fetch files with uploader email via join, newest first
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
      })
      .from(files)
      .innerJoin(users, eq(files.uploadedBy, users.id))
      .where(eq(files.folderId, parsed.data.folderId))
      .orderBy(desc(files.createdAt));

    return Response.json(rows);
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/FileList.tsx src/app/api/files/route.ts && git commit -m "feat(ui): add FileList component with search, download, and empty state"
```

---

## Task 8: UploadModal component

**Files:**
- Create: `cis-deal-room/src/components/workspace/UploadModal.tsx`

- [ ] **Step 1: Install react-dropzone**

```bash
cd cis-deal-room && npm install react-dropzone
```

Expected: `added 1 package` with no errors.

- [ ] **Step 2: Create the UploadModal component**

Create `cis-deal-room/src/components/workspace/UploadModal.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Folder {
  id: string;
  name: string;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  initialFolderId?: string;
  workspaceId: string;
  onUploadComplete: () => void;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/csv': ['.csv'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'video/mp4': ['.mp4'],
};

const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

type FileStatus = 'pending' | 'duplicate' | 'uploading' | 'done' | 'error';

interface QueuedFile {
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  duplicateVersion?: number;
  confirmedVersioning?: boolean;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadModal({
  open,
  onClose,
  folders,
  initialFolderId,
  workspaceId,
  onUploadComplete,
}: UploadModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId ?? folders[0]?.id ?? '');
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, status: 'pending' as FileStatus, progress: 0 })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  function updateFile(index: number, patch: Partial<QueuedFile>) {
    setQueue((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFile(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadOne(qf: QueuedFile, index: number, folderId: string): Promise<boolean> {
    const { file, confirmedVersioning } = qf;

    // 1. Request presigned URL
    const presignRes = await fetch('/api/files/presign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        workspaceId,
      }),
    });

    const presignData = await presignRes.json();

    if (!presignRes.ok) {
      updateFile(index, { status: 'error', error: presignData.error ?? 'Upload failed' });
      return false;
    }

    // 2. Duplicate detected and not yet confirmed
    if (presignData.duplicate && !confirmedVersioning) {
      updateFile(index, { status: 'duplicate', duplicateVersion: presignData.existingVersion });
      return false;
    }

    const { presignedUrl, s3Key } = presignData;

    // 3. Upload to S3 (or skip for stub)
    if (presignedUrl) {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateFile(index, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 PUT failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    }

    // 4. Confirm with the API
    const confirmRes = await fetch('/api/files/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        fileName: file.name,
        s3Key,
        sizeBytes: file.size,
        mimeType: file.type,
        workspaceId,
        confirmedVersioning: confirmedVersioning ?? false,
      }),
    });

    if (!confirmRes.ok) {
      const body = await confirmRes.json();
      updateFile(index, { status: 'error', error: body.error ?? 'Confirm failed' });
      return false;
    }

    updateFile(index, { status: 'done', progress: 100 });
    return true;
  }

  async function handleUpload() {
    if (!selectedFolderId || queue.length === 0) return;
    setUploading(true);

    let anySuccess = false;
    for (let i = 0; i < queue.length; i++) {
      const qf = queue[i];
      if (qf.status === 'done' || qf.status === 'error') continue;
      updateFile(i, { status: 'uploading', progress: 0 });
      const ok = await uploadOne(qf, i, selectedFolderId);
      if (ok) anySuccess = true;
    }

    setUploading(false);
    if (anySuccess) onUploadComplete();
  }

  function handleClose() {
    if (uploading) return;
    setQueue([]);
    onClose();
  }

  const allDone = queue.length > 0 && queue.every((f) => f.status === 'done');

  return (
    <Modal open={open} onClose={handleClose} title="Upload Documents">
      <div className="space-y-4">
        {/* Folder selector */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Upload to folder
          </label>
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            disabled={uploading}
            className="w-full bg-[#1F1F1F] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm
              text-white focus:outline-none focus:ring-2 focus:ring-[#E10600]"
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-[#E10600] bg-[#E10600]/5'
              : 'border-[#2A2A2A] hover:border-[#3A3A3A] bg-[#141414]'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={28} className="mx-auto mb-2 text-neutral-500" />
          <p className="text-sm font-medium text-neutral-300">
            {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            PDF, DOCX, XLSX, PPTX, CSV, JPG, PNG, MP4 — max 500 MB each
          </p>
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {queue.map((qf, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate font-medium">{qf.file.name}</span>
                    <span className="text-xs text-neutral-500 shrink-0">{formatBytes(qf.file.size)}</span>
                  </div>

                  {qf.status === 'uploading' && (
                    <div className="mt-1.5 h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#E10600] transition-all duration-150"
                        style={{ width: `${qf.progress}%` }}
                      />
                    </div>
                  )}

                  {qf.status === 'duplicate' && (
                    <p className="text-xs text-yellow-400 mt-1">
                      File exists (v{qf.duplicateVersion}) —{' '}
                      <button
                        onClick={() => updateFile(i, { status: 'pending', confirmedVersioning: true })}
                        className="underline hover:no-underline"
                      >
                        Upload as v{(qf.duplicateVersion ?? 0) + 1}
                      </button>
                      {' '}or{' '}
                      <button onClick={() => removeFile(i)} className="underline hover:no-underline">
                        cancel
                      </button>
                    </p>
                  )}

                  {qf.status === 'error' && (
                    <p className="text-xs text-[#E10600] mt-1">{qf.error}</p>
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0">
                  {qf.status === 'done' && <CheckCircle size={16} className="text-green-400" />}
                  {qf.status === 'uploading' && <Loader2 size={16} className="text-[#E10600] animate-spin" />}
                  {qf.status === 'error' && <AlertCircle size={16} className="text-[#E10600]" />}
                  {(qf.status === 'pending' || qf.status === 'duplicate') && !uploading && (
                    <button onClick={() => removeFile(i)} className="text-neutral-500 hover:text-white">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#1F1F1F] text-neutral-300
              hover:bg-[#2A2A2A] transition-colors disabled:opacity-50"
          >
            {allDone ? 'Done' : 'Cancel'}
          </button>
          {!allDone && (
            <button
              onClick={handleUpload}
              disabled={uploading || queue.length === 0 || queue.every((f) => f.status === 'done')}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#E10600] text-white
                hover:bg-[#C10500] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading && <Loader2 size={14} className="animate-spin" />}
              {uploading ? 'Uploading…' : `Upload ${queue.filter((f) => f.status === 'pending').length || ''} file${queue.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/UploadModal.tsx package.json package-lock.json && git commit -m "feat(ui): add UploadModal with drag-drop, XHR progress, and duplicate versioning flow"
```

---

## Task 9: Wire WorkspaceShell

**Files:**
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Read the current WorkspaceShell**

Open `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` and confirm it has:
- `import { DealOverview }` in the center panel
- An Upload button in the header (currently calls `setShowUpload` or similar)
- `selectedFolderId` state

- [ ] **Step 2: Update WorkspaceShell to wire FileList and UploadModal**

Replace the imports and state section at the top, then update the center panel render. The key changes are:
1. Import `FileList` and `UploadModal` instead of (or alongside) `DealOverview`
2. Add `showUploadModal` state and `uploadRevision` counter
3. Show `FileList` when a folder is selected, `DealOverview` when none is selected
4. Wire the Upload button to `setShowUploadModal(true)`

Add these imports to `WorkspaceShell.tsx` (after existing imports):

```typescript
import { FileList } from './FileList';
import { UploadModal } from './UploadModal';
```

Add these state variables inside the component (after existing `useState` calls):

```typescript
const [showUploadModal, setShowUploadModal] = useState(false);
const [uploadRevision, setUploadRevision] = useState(0);
```

Replace the Upload button in the header (find the existing button with `↑ Upload Files` or similar label) with:

```typescript
<button
  onClick={() => setShowUploadModal(true)}
  className="flex items-center gap-1.5 bg-[#E10600] hover:bg-[#C10500] text-white
    text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
>
  Upload Files
</button>
```

Replace the center panel content (the section that renders `<DealOverview>`) with:

```typescript
{/* Center panel */}
<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
  {selectedFolderId ? (
    <FileList
      folderId={selectedFolderId}
      folderName={folders.find((f) => f.id === selectedFolderId)?.name ?? 'Files'}
      isAdmin={isAdmin}
      onUpload={() => setShowUploadModal(true)}
      uploadRevision={uploadRevision}
    />
  ) : (
    <DealOverview workspace={workspace} folders={folders} />
  )}
</div>
```

Add `UploadModal` at the end of the JSX, before the closing `</div>`:

```typescript
<UploadModal
  open={showUploadModal}
  onClose={() => setShowUploadModal(false)}
  folders={folders}
  initialFolderId={selectedFolderId ?? undefined}
  workspaceId={workspace.id}
  onUploadComplete={() => {
    setShowUploadModal(false);
    setUploadRevision((n) => n + 1);
  }}
/>
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
cd cis-deal-room && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room && git add src/components/workspace/WorkspaceShell.tsx && git commit -m "feat(ui): wire FileList and UploadModal into WorkspaceShell center panel"
```

---

## Task 10: Verify workspace creation enforcement

- [ ] **Step 1: Check NewDealModal — confirm no changes needed**

Open `cis-deal-room/src/components/deals/NewDealModal.tsx` and verify:
- `cisAdvisorySide` state starts as `''` (no default selected)
- Zod schema uses `z.enum(['buyer_side', 'seller_side'])` with no `.default()`
- The Create button is only enabled when form passes validation (submit triggers Zod parse which fails on empty `cisAdvisorySide`)
- All four fields (name, clientName, cisAdvisorySide, status) are present in the form

If all of the above are true (they should be — Phase 1 already implemented this correctly), no changes are needed.

- [ ] **Step 2: Confirm API Zod schema enforces all fields**

Open `cis-deal-room/src/app/api/workspaces/route.ts` and verify:
- `createWorkspaceSchema` has `cisAdvisorySide: z.enum(['buyer_side', 'seller_side'])` with no `.default()`
- `name` and `clientName` both use `.min(1, ...)` — rejects empty strings

If all of the above are true, no changes are needed.

- [ ] **Step 3: Commit (no-op if no changes)**

If changes were made:
```bash
cd cis-deal-room && git add src/components/deals/NewDealModal.tsx src/app/api/workspaces/route.ts && git commit -m "fix(validation): enforce all required fields on workspace creation"
```

If no changes needed, add a note in `docs/superpowers/specs/2026-04-13-cis-deal-room-design.md` confirming this was verified.

---

## Self-Review Checklist

After all tasks complete, run:

```bash
cd cis-deal-room && npx vitest run && npx tsc --noEmit
```

Both should pass with zero errors before marking Phase 2 complete.

**Spec coverage:**
- [x] Presigned PutObject upload URL with type/size validation — Task 3
- [x] Direct browser→S3 upload with XHR progress — Task 8
- [x] Confirm route creates file record + logs activity — Task 4
- [x] Duplicate detection with version choice — Tasks 3, 4, 8
- [x] File versioning (version integer increments) — Tasks 2, 4
- [x] Presigned GetObject download with 15-min expiry + activity log — Task 5
- [x] Admin file delete (S3 + DB + activity log) — Tasks 2, 6
- [x] File list UI with search, NEW badge placeholder, type icons — Task 7
- [x] S3 stub when AWS_S3_BUCKET unset — Tasks 3, 5, 6, 8
- [x] Workspace creation enforces all four fields — Task 10

---

*Phase 3 plan (Collaboration) to be written after Phase 2 is verified complete.*
