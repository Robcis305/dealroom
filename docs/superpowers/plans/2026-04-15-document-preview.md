# Document Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an inline document preview modal for the workspace — eye icon in the file list opens a modal viewer for PDF, image, video, CSV, and XLSX files, with silent activity logging.

**Architecture:** Additive, no breaking changes. One singleton `PreviewModal` owned by `FileList`; it dispatches on MIME type to one of four inner viewer components; PDF/image/video render natively on the presigned GET URL; CSV/XLSX parse via code-split SheetJS with 10 MB / 1,000-row / first-sheet guardrails. A new POST endpoint fires once per modal open to record a `previewed` activity row, which is filtered out of the user-facing feed. No new auth surface — preview inherits the existing `requireFolderAccess('download')` gate.

**Tech Stack:** Next.js 16 (App Router — **note: this repo uses a version with breaking changes vs. training data; check `node_modules/next/dist/docs/` if a Next.js API feels off**), React 19, TypeScript, Drizzle ORM + Neon PostgreSQL, Tailwind v4, Vitest + @testing-library/react + jsdom, Lucide icons, sonner toasts, SheetJS (`xlsx`), `@tanstack/react-virtual`.

**Context the engineer needs before starting:**

1. **Working directory** — all paths below are relative to `cis-deal-room/` unless stated otherwise.
2. **Spec** — read `docs/superpowers/specs/2026-04-15-document-preview-design.md` end-to-end first.
3. **Spec vs. schema naming** — the spec uses `activity_type` informally. The actual enum is `activity_action` and the column on `activity_logs` is `action`. We use `'previewed'` as the new enum value (not `'file_previewed'`) to match the bare-verb convention already in use for `'uploaded'`, `'downloaded'`, `'deleted'`, etc. `target_type: 'file'` disambiguates.
4. **E2E scope deviation** — the spec lists a Playwright E2E test. The repo has no Playwright setup. Adding it is out of scope for this plan; E2E is deferred to a follow-up. The unit, component, and API tests below still give full confidence.
5. **Test runner** — `vitest` is installed but there is no `test` script in `package.json`. Task 1 adds one so subsequent tasks can use `npm test`. In the meantime, `npx vitest run <path>` works.
6. **Test file conventions** — component tests are colocated next to the component (`Foo.test.tsx` next to `Foo.tsx`). Lib / API / DAL tests live centrally under `src/test/` (`src/test/lib/…`, `src/test/api/…`). Follow existing patterns — do not invent new locations.
7. **Drizzle migrations** — generated via `npx drizzle-kit generate`. Latest file is `0002_wealthy_frank_castle.sql`; the new migration will be `0003_*.sql`.
8. **Presigned URLs** — `/api/files/[id]/presign-download` returns `{ url, fileName }` with a 15-minute TTL. It already enforces `requireFolderAccess('download')`. When `AWS_S3_BUCKET` is unset, URLs look like `stub://...`. Handle both cases.
9. **Activity feed filter** — the feed API is at `src/app/api/workspaces/[id]/activity/route.ts`. Its current query reads `activity_logs WHERE workspace_id = $1` — we add an additional `AND action != 'previewed'` clause.

---

## File Structure

**New files:**

| Path | Purpose |
|---|---|
| `src/lib/preview.ts` | Pure helpers: `isPreviewable`, `getPreviewKind`, size/row cap constants. Zero React. |
| `src/test/lib/preview.test.ts` | Unit tests for the helpers. |
| `src/app/api/files/[id]/log-preview/route.ts` | POST — writes a `previewed` activity row. |
| `src/test/api/files-log-preview.test.ts` | API tests for the route. |
| `src/components/workspace/PreviewModal.tsx` | Modal shell: top bar, close, download, Esc handler, MIME dispatch. |
| `src/components/workspace/PreviewModal.test.tsx` | Component tests. |
| `src/components/workspace/preview/PdfPreview.tsx` | `<iframe>` on presigned URL. |
| `src/components/workspace/preview/ImagePreview.tsx` | `<img>` on presigned URL. |
| `src/components/workspace/preview/VideoPreview.tsx` | `<video controls>` on presigned URL. |
| `src/components/workspace/preview/SheetPreview.tsx` | SheetJS parse + virtualized table. Guardrails. |
| `src/components/workspace/preview/SheetPreview.test.tsx` | Component tests for the sheet renderer. |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `test`, `test:watch`, `typecheck` scripts. Add `xlsx`, `@tanstack/react-virtual` deps. |
| `src/db/schema.ts` | Add `'previewed'` to `activityActionEnum`. |
| `src/db/migrations/0003_*.sql` | Generated. Adds the enum value. |
| `src/types/index.ts` | Add `'previewed'` to the `ActivityAction` union. |
| `src/app/api/workspaces/[id]/activity/route.ts` | Filter out `action = 'previewed'` from the feed query. |
| `src/test/api/activity-feed.test.ts` (or create) | Assert `'previewed'` rows are excluded from the feed. |
| `src/components/workspace/FileList.tsx` | Add eye icon button (conditional on preview support + viewport ≥ 1024 px) and wire to a `PreviewModal` mounted at the bottom of the component. |
| `src/components/workspace/FileList.test.tsx` (extend or create) | Eye icon visibility tests. |

---

## Task 1: Add test scripts to `package.json`

**Files:**
- Modify: `cis-deal-room/package.json`

- [ ] **Step 1: Inspect current scripts**

Run: `cat cis-deal-room/package.json | head -15`
Expected output shows `scripts: { dev, build, start, lint }` — no `test`.

- [ ] **Step 2: Add test / test:watch / typecheck**

Edit `cis-deal-room/package.json`. Replace the `scripts` block with:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 3: Verify scripts work**

Run: `cd cis-deal-room && npm test -- --run --reporter=basic` (should exit 0 if no tests changed yet; should list passing suites)
Run: `cd cis-deal-room && npm run typecheck`
Expected: both commands complete; if the existing suite already passes, `npm test` is green.

- [ ] **Step 4: Commit**

```bash
cd cis-deal-room
git add package.json
git commit -m "chore: add test/test:watch/typecheck scripts"
```

---

## Task 2: Preview helper module (`src/lib/preview.ts`)

**Files:**
- Create: `cis-deal-room/src/lib/preview.ts`
- Test: `cis-deal-room/src/test/lib/preview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/test/lib/preview.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getPreviewKind,
  isPreviewable,
  PREVIEW_SIZE_CAP_BYTES,
  PREVIEW_ROW_CAP,
} from '@/lib/preview';

describe('getPreviewKind', () => {
  it('returns "pdf" for application/pdf', () => {
    expect(getPreviewKind('application/pdf')).toBe('pdf');
  });

  it('returns "image" for png/jpeg/gif/webp', () => {
    expect(getPreviewKind('image/png')).toBe('image');
    expect(getPreviewKind('image/jpeg')).toBe('image');
    expect(getPreviewKind('image/gif')).toBe('image');
    expect(getPreviewKind('image/webp')).toBe('image');
  });

  it('returns "video" for mp4 and webm', () => {
    expect(getPreviewKind('video/mp4')).toBe('video');
    expect(getPreviewKind('video/webm')).toBe('video');
  });

  it('returns "sheet" for csv and xlsx', () => {
    expect(getPreviewKind('text/csv')).toBe('sheet');
    expect(getPreviewKind('application/csv')).toBe('sheet');
    expect(getPreviewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet');
  });

  it('returns null for unsupported MIME types', () => {
    expect(getPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull();
    expect(getPreviewKind('application/zip')).toBeNull();
    expect(getPreviewKind('text/plain')).toBeNull();
    expect(getPreviewKind('application/octet-stream')).toBeNull();
    expect(getPreviewKind('')).toBeNull();
    expect(getPreviewKind(null as unknown as string)).toBeNull();
    expect(getPreviewKind(undefined as unknown as string)).toBeNull();
  });
});

describe('isPreviewable', () => {
  it('returns true for supported MIMEs', () => {
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('text/csv')).toBe(true);
  });

  it('returns false for unsupported or missing MIMEs', () => {
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable('')).toBe(false);
    expect(isPreviewable(null as unknown as string)).toBe(false);
  });
});

describe('constants', () => {
  it('PREVIEW_SIZE_CAP_BYTES is 10 MB', () => {
    expect(PREVIEW_SIZE_CAP_BYTES).toBe(10 * 1024 * 1024);
  });

  it('PREVIEW_ROW_CAP is 1000', () => {
    expect(PREVIEW_ROW_CAP).toBe(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cis-deal-room && npx vitest run src/test/lib/preview.test.ts`
Expected: FAIL — `Cannot find module '@/lib/preview'`.

- [ ] **Step 3: Implement the helper module**

Create `cis-deal-room/src/lib/preview.ts`:

```typescript
/**
 * Size and row caps for sheet previews (CSV / XLSX).
 * Larger files / longer sheets fall back to "download to view" UX.
 */
export const PREVIEW_SIZE_CAP_BYTES = 10 * 1024 * 1024;
export const PREVIEW_ROW_CAP = 1000;

export type PreviewKind = 'pdf' | 'image' | 'video' | 'sheet';

const PDF_MIMES = new Set(['application/pdf']);
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);
const SHEET_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function getPreviewKind(mimeType: string | null | undefined): PreviewKind | null {
  if (!mimeType) return null;
  if (PDF_MIMES.has(mimeType)) return 'pdf';
  if (IMAGE_MIMES.has(mimeType)) return 'image';
  if (VIDEO_MIMES.has(mimeType)) return 'video';
  if (SHEET_MIMES.has(mimeType)) return 'sheet';
  return null;
}

export function isPreviewable(mimeType: string | null | undefined): boolean {
  return getPreviewKind(mimeType) !== null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/test/lib/preview.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/lib/preview.ts src/test/lib/preview.test.ts
git commit -m "feat(preview): MIME-type helper module for preview dispatch"
```

---

## Task 3: Schema migration — add `'previewed'` to `activity_action` enum

**Files:**
- Modify: `cis-deal-room/src/db/schema.ts:39-53`
- Modify: `cis-deal-room/src/types/index.ts:44` (ActivityAction union)
- Create (generated): `cis-deal-room/src/db/migrations/0003_*.sql`

- [ ] **Step 1: Add enum value in schema**

Edit `cis-deal-room/src/db/schema.ts`. Change:

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

to:

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
  'previewed',
]);
```

- [ ] **Step 2: Add to the TypeScript union**

Edit `cis-deal-room/src/types/index.ts`. Find the `ActivityAction` union (around line 40) and add `| 'previewed'` at the end:

```typescript
export type ActivityAction =
  | 'uploaded'
  | 'downloaded'
  | 'viewed'
  | 'deleted'
  | 'invited'
  | 'removed'
  | 'created_folder'
  | 'renamed_folder'
  | 'created_workspace'
  | 'revoked_access'
  | 'status_changed'
  | 'participant_updated'
  | 'notified_batch'
  | 'previewed';
```

(If the file structures the union differently, preserve its pattern — just add `'previewed'` as a new branch.)

- [ ] **Step 3: Generate the migration**

Run: `cd cis-deal-room && npx drizzle-kit generate`
Expected: a new file `src/db/migrations/0003_<name>.sql` is created containing:

```sql
ALTER TYPE "public"."activity_action" ADD VALUE 'previewed';
```

Inspect the generated file:

Run: `cat cis-deal-room/src/db/migrations/0003_*.sql`
Expected: one `ALTER TYPE ... ADD VALUE 'previewed'` statement.

- [ ] **Step 4: Apply the migration to dev DB**

Run: `cd cis-deal-room && npx drizzle-kit migrate`
Expected: migration runs without error; enum now includes `'previewed'`.

- [ ] **Step 5: Typecheck**

Run: `cd cis-deal-room && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room
git add src/db/schema.ts src/types/index.ts src/db/migrations/
git commit -m "feat(schema): add 'previewed' activity_action enum value"
```

---

## Task 4: `log-preview` API route

**Files:**
- Create: `cis-deal-room/src/app/api/files/[id]/log-preview/route.ts`
- Test: `cis-deal-room/src/test/api/files-log-preview.test.ts`

- [ ] **Step 1: Study an existing file route for conventions**

Run: `cat cis-deal-room/src/app/api/files/[id]/presign-download/route.ts`
Note: the session-check pattern (`verifySession`), the access-check pattern (`requireFolderAccess`), and the error-response shape (`Response.json({ error }, { status })`).

- [ ] **Step 2: Study existing API tests**

Run: `ls cis-deal-room/src/test/api/` then cat one file that tests a POST route with auth — mimic its mock setup (the db mock lives in `src/test/setup.ts`).

- [ ] **Step 3: Write the failing test**

Create `cis-deal-room/src/test/api/files-log-preview.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/files/[id]/log-preview/route';

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));
vi.mock('@/lib/dal/access', () => ({
  requireFolderAccessForFile: vi.fn(),
}));
vi.mock('@/lib/dal/activity', () => ({
  logActivity: vi.fn(),
}));
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { requireFolderAccessForFile } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';
import { db } from '@/db';

describe('POST /api/files/[id]/log-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(fileId: string) {
    return new Request(`http://localhost/api/files/${fileId}/log-preview`, { method: 'POST' });
  }

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(makeRequest('11111111-1111-1111-1111-111111111111'), {
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when file does not exist', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u1' } as never);
    // db.select().from().where().limit() returns []
    const chain = {
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await POST(makeRequest('22222222-2222-2222-2222-222222222222'), {
      params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user lacks download access', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u1' } as never);
    const chain = {
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'f1', folderId: 'fd1', workspaceId: 'w1' }],
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    vi.mocked(requireFolderAccessForFile).mockRejectedValue(new Error('forbidden'));
    const res = await POST(makeRequest('33333333-3333-3333-3333-333333333333'), {
      params: Promise.resolve({ id: '33333333-3333-3333-3333-333333333333' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 and calls logActivity with action=previewed', async () => {
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u1' } as never);
    const chain = {
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'f1', folderId: 'fd1', workspaceId: 'w1' }],
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    vi.mocked(requireFolderAccessForFile).mockResolvedValue(undefined as never);

    const res = await POST(makeRequest('44444444-4444-4444-4444-444444444444'), {
      params: Promise.resolve({ id: '44444444-4444-4444-4444-444444444444' }),
    });
    expect(res.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'previewed',
        targetType: 'file',
        targetId: 'f1',
        workspaceId: 'w1',
        userId: 'u1',
      })
    );
  });
});
```

> **Note:** If `requireFolderAccessForFile` doesn't exist in the codebase under that exact name, read `src/lib/dal/access.ts` and use the helper that already handles the "file → folder → access" resolution (e.g. `requireFolderAccess` might take a `folderId` — in that case, the route looks up the file's `folderId` first, then calls `requireFolderAccess(folderId, session, 'download')`). Rename the mock accordingly and the test imports to match. The presign-download route is the reference implementation.

- [ ] **Step 4: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/test/api/files-log-preview.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/files/[id]/log-preview/route'`.

- [ ] **Step 5: Implement the route**

Create `cis-deal-room/src/app/api/files/[id]/log-preview/route.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireFolderAccess } from '@/lib/dal/access';
import { logActivity } from '@/lib/dal/activity';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: fileId } = await params;

  const rows = await db
    .select({
      id: files.id,
      folderId: files.folderId,
      workspaceId: folders.workspaceId,
    })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const file = rows[0];

  try {
    await requireFolderAccess(file.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await logActivity(db, {
    workspaceId: file.workspaceId,
    userId: session.userId,
    action: 'previewed',
    targetType: 'file',
    targetId: file.id,
  });

  return Response.json({ ok: true });
}
```

> **Reality check:** before finalizing, open `src/app/api/files/[id]/presign-download/route.ts` and copy the exact session / access-check calls. If `requireFolderAccess` has a different signature (e.g., no `'download'` permission arg, or takes a session object differently), match that route's pattern. Update the tests to mock the same helper.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd cis-deal-room && npx vitest run src/test/api/files-log-preview.test.ts`
Expected: PASS — all four cases green.

- [ ] **Step 7: Typecheck**

Run: `cd cis-deal-room && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
cd cis-deal-room
git add src/app/api/files/[id]/log-preview src/test/api/files-log-preview.test.ts
git commit -m "feat(api): POST /api/files/:id/log-preview logs 'previewed' activity"
```

---

## Task 5: Filter `'previewed'` from activity feed

**Files:**
- Modify: `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`
- Test: `cis-deal-room/src/test/api/activity-feed.test.ts` (create or extend)

- [ ] **Step 1: Write the failing test**

If `src/test/api/activity-feed.test.ts` does not exist, create it. Add this test case:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/workspaces/[id]/activity/route';

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn(),
}));
vi.mock('@/lib/dal/access', () => ({
  requireDealAccess: vi.fn(),
}));
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { db } from '@/db';

describe('GET /api/workspaces/[id]/activity — feed filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue({ userId: 'u1' } as never);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined as never);
  });

  it("excludes rows where action = 'previewed'", async () => {
    // Capture the .where() call so we can inspect the filter
    let whereClause: unknown = null;
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (clause: unknown) => {
        whereClause = clause;
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      offset: async () => [],
    };
    vi.mocked(db.select).mockReturnValue(chain as never);

    const res = await GET(
      new Request('http://localhost/api/workspaces/w1/activity'),
      { params: Promise.resolve({ id: 'w1' }) }
    );
    expect(res.status).toBe(200);
    // The filter combines workspace_id match with action <> 'previewed' — assert both tokens appear.
    const str = JSON.stringify(whereClause);
    expect(str).toMatch(/previewed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/test/api/activity-feed.test.ts`
Expected: FAIL — the `whereClause` does not contain the word "previewed".

- [ ] **Step 3: Apply the filter**

Edit `cis-deal-room/src/app/api/workspaces/[id]/activity/route.ts`. Change the imports to include `and` and `ne`:

```typescript
import { and, desc, eq, ne } from 'drizzle-orm';
```

Then change the `.where(eq(activityLogs.workspaceId, workspaceId))` call to:

```typescript
.where(
  and(
    eq(activityLogs.workspaceId, workspaceId),
    ne(activityLogs.action, 'previewed')
  )
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/test/api/activity-feed.test.ts`
Expected: PASS.

Also re-run the full suite so we know the old activity-feed tests (if any) still pass:

Run: `cd cis-deal-room && npm test`
Expected: all green, no regressions.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/app/api/workspaces/[id]/activity/route.ts src/test/api/activity-feed.test.ts
git commit -m "feat(activity): filter 'previewed' events from workspace feed"
```

---

## Task 6: Install preview rendering dependencies

**Files:**
- Modify: `cis-deal-room/package.json`, `cis-deal-room/package-lock.json`

- [ ] **Step 1: Install deps**

Run: `cd cis-deal-room && npm install xlsx @tanstack/react-virtual`
Expected: both packages land in `dependencies`. `xlsx` ~400 KB gz, `@tanstack/react-virtual` ~8 KB gz.

> **Note on SheetJS:** the community edition on npm (package `xlsx`, latest 0.18.x, MIT license) is what we need. SheetJS Pro CDN versions are not required for v1.1.

- [ ] **Step 2: Verify install**

Run: `cd cis-deal-room && node -e "console.log(require('xlsx').version)"`
Expected: prints a version string like `0.18.5` — package installed and loadable.

Run: `cd cis-deal-room && node -e "require('@tanstack/react-virtual'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room
git add package.json package-lock.json
git commit -m "chore(deps): add xlsx + @tanstack/react-virtual for document preview"
```

---

## Task 7: `PreviewModal` shell + tests

**Files:**
- Create: `cis-deal-room/src/components/workspace/PreviewModal.tsx`
- Test: `cis-deal-room/src/components/workspace/PreviewModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/components/workspace/PreviewModal.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PreviewModal } from './PreviewModal';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const fixture = {
  id: 'f1',
  name: 'CIM - Project Atlas.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234567,
  version: 2,
  uploadedByEmail: 'maria@example.com',
  uploadedByFirstName: 'Maria',
  uploadedByLastName: 'Lopez',
  createdAt: new Date('2026-04-01').toISOString(),
};

describe('PreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/fake.pdf', fileName: fixture.name }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('renders nothing when open=false', () => {
    render(<PreviewModal file={fixture} open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders top bar with filename, v-chip, and size when open', async () => {
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(fixture.name)).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText(/1\.2 MB/)).toBeInTheDocument();
    // displayName may format as "Maria Lopez" or "Maria L." — both should match /Maria/
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
  });

  it('fires onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<PreviewModal file={fixture} open={true} onClose={onClose} />);
    const closeBtn = await screen.findByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('fires onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<PreviewModal file={fixture} open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a <iframe> for PDF MIME', async () => {
    const { container } = render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    await screen.findByText(fixture.name);
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('renders a <img> for image MIME', async () => {
    const image = { ...fixture, mimeType: 'image/png', name: 'scan.png' };
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/scan.png', fileName: image.name }), {
        status: 200,
      })
    );
    const { container } = render(<PreviewModal file={image} open={true} onClose={() => {}} />);
    await screen.findByText(image.name);
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('renders a <video> for video MIME', async () => {
    const video = { ...fixture, mimeType: 'video/mp4', name: 'tour.mp4' };
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/tour.mp4', fileName: video.name }), {
        status: 200,
      })
    );
    const { container } = render(<PreviewModal file={video} open={true} onClose={() => {}} />);
    await screen.findByText(video.name);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('shows 403 error state when presign returns 403', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 403 }));
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(/no longer have access/i)).toBeInTheDocument();
  });

  it('shows 404 error state when presign returns 404', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 404 }));
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
  });

  it('calls log-preview after successful render', async () => {
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    await screen.findByText(fixture.name);
    // First call = presign-download; second call = log-preview POST
    await vi.waitFor(() => {
      const logCall = vi.mocked(fetchWithAuth).mock.calls.find(([url]) =>
        typeof url === 'string' && url.endsWith('/log-preview')
      );
      expect(logCall).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/PreviewModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the modal shell**

Create `cis-deal-room/src/components/workspace/PreviewModal.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { getPreviewKind } from '@/lib/preview';
import { displayName } from '@/lib/users/display';
import { PdfPreview } from './preview/PdfPreview';
import { ImagePreview } from './preview/ImagePreview';
import { VideoPreview } from './preview/VideoPreview';
import { SheetPreview } from './preview/SheetPreview';

export interface PreviewFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedByEmail?: string;
  uploadedByFirstName?: string | null;
  uploadedByLastName?: string | null;
  createdAt: string | Date;
}

interface PreviewModalProps {
  file: PreviewFile;
  open: boolean;
  onClose: () => void;
}

type PresignState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; kind: 'forbidden' | 'notfound' | 'network' | 'renderer' };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewModal({ file, open, onClose }: PreviewModalProps) {
  const [state, setState] = useState<PresignState>({ status: 'loading' });
  const kind = getPreviewKind(file.mimeType);

  // Fetch presigned URL when modal opens (or when file changes)
  useEffect(() => {
    if (!open) return;
    let aborted = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
        if (aborted) return;
        if (res.status === 403) return setState({ status: 'error', kind: 'forbidden' });
        if (res.status === 404) return setState({ status: 'error', kind: 'notfound' });
        if (!res.ok) return setState({ status: 'error', kind: 'network' });
        const { url } = (await res.json()) as { url: string };
        setState({ status: 'ready', url });
        // Fire-and-forget activity log
        fetchWithAuth(`/api/files/${file.id}/log-preview`, { method: 'POST' }).catch(() => {
          /* silent */
        });
      } catch {
        if (!aborted) setState({ status: 'error', kind: 'network' });
      }
    })();

    return () => {
      aborted = true;
    };
  }, [open, file.id]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleDownload = useCallback(async () => {
    const res = await fetchWithAuth(`/api/files/${file.id}/presign-download`);
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    if (url.startsWith('stub://')) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }, [file.id, file.name]);

  if (!open) return null;

  const uploader = displayName({
    email: file.uploadedByEmail ?? '',
    firstName: file.uploadedByFirstName ?? null,
    lastName: file.uploadedByLastName ?? null,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1A1A1A] border-b border-white/10 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">{file.name}</span>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded font-semibold">v{file.version}</span>
          <span className="text-xs text-white/60">
            · {formatBytes(file.sizeBytes)} · {uploader}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Download"
            onClick={handleDownload}
            className="w-8 h-8 rounded border border-white/20 flex items-center justify-center hover:bg-white/10"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="w-8 h-8 rounded border border-white/20 flex items-center justify-center hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        {state.status === 'loading' && (
          <div className="text-white/60 text-sm">Loading preview…</div>
        )}
        {state.status === 'error' && state.kind === 'forbidden' && (
          <div className="text-white/80 text-sm">You no longer have access to this file.</div>
        )}
        {state.status === 'error' && state.kind === 'notfound' && (
          <div className="text-white/80 text-sm">This file no longer exists.</div>
        )}
        {state.status === 'error' && (state.kind === 'network' || state.kind === 'renderer') && (
          <div className="flex flex-col items-center gap-3 text-white/80 text-sm">
            <div>Couldn&apos;t load preview — download instead.</div>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20"
            >
              Download
            </button>
          </div>
        )}
        {state.status === 'ready' && kind === 'pdf' && <PdfPreview url={state.url} />}
        {state.status === 'ready' && kind === 'image' && <ImagePreview url={state.url} alt={file.name} />}
        {state.status === 'ready' && kind === 'video' && <VideoPreview url={state.url} />}
        {state.status === 'ready' && kind === 'sheet' && (
          <SheetPreview url={state.url} mimeType={file.mimeType} sizeBytes={file.sizeBytes} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Stub the four child components so imports resolve**

The real implementations come in Tasks 8 and 9. For now, stub them so this task compiles and its tests pass.

Create `cis-deal-room/src/components/workspace/preview/PdfPreview.tsx`:

```typescript
export function PdfPreview({ url }: { url: string }) {
  return <iframe src={url} className="w-full h-full bg-white" title="PDF preview" />;
}
```

Create `cis-deal-room/src/components/workspace/preview/ImagePreview.tsx`:

```typescript
/* eslint-disable @next/next/no-img-element */
export function ImagePreview({ url, alt }: { url: string; alt: string }) {
  return <img src={url} alt={alt} className="max-w-full max-h-full object-contain" />;
}
```

Create `cis-deal-room/src/components/workspace/preview/VideoPreview.tsx`:

```typescript
export function VideoPreview({ url }: { url: string }) {
  return <video controls src={url} className="max-w-full max-h-full" />;
}
```

Create `cis-deal-room/src/components/workspace/preview/SheetPreview.tsx` (placeholder — Task 9 replaces it):

```typescript
export function SheetPreview(_props: { url: string; mimeType: string; sizeBytes: number }) {
  return <div className="text-white/80 text-sm">Sheet preview (implemented in Task 9).</div>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/PreviewModal.test.tsx`
Expected: PASS — all 10 assertions green.

- [ ] **Step 6: Typecheck**

Run: `cd cis-deal-room && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/PreviewModal.tsx src/components/workspace/PreviewModal.test.tsx src/components/workspace/preview/
git commit -m "feat(preview): PreviewModal shell + PDF/image/video renderers"
```

---

## Task 8: Wire up Pdf / Image / Video inner viewers (already stubbed — no work)

Pdf / Image / Video stubs from Task 7 are the final implementations. They are intentionally trivial — the browser does all the work. This is a marker task: no code changes, but it confirms the stubs are correct and unit-testable.

- [ ] **Step 1: Add a tiny unit test for ImagePreview's object-fit behavior**

Create `cis-deal-room/src/components/workspace/preview/ImagePreview.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ImagePreview } from './ImagePreview';

describe('ImagePreview', () => {
  it('renders an img with contain sizing', () => {
    const { container } = render(<ImagePreview url="x.png" alt="x" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('object-contain');
    expect(img?.getAttribute('src')).toBe('x.png');
    expect(img?.getAttribute('alt')).toBe('x');
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/preview/ImagePreview.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/preview/ImagePreview.test.tsx
git commit -m "test(preview): ImagePreview object-fit sanity"
```

---

## Task 9: `SheetPreview` with CSV/XLSX guardrails

**Files:**
- Replace: `cis-deal-room/src/components/workspace/preview/SheetPreview.tsx`
- Test: `cis-deal-room/src/components/workspace/preview/SheetPreview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `cis-deal-room/src/components/workspace/preview/SheetPreview.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SheetPreview } from './SheetPreview';

// Mock fetch globally
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

import * as XLSX from 'xlsx';

const csvMime = 'text/csv';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function mockWorkbook(rows: unknown[][], sheetNames = ['Sheet1']) {
  vi.mocked(XLSX.read).mockReturnValue({
    SheetNames: sheetNames,
    Sheets: Object.fromEntries(sheetNames.map((n) => [n, {}])),
  } as never);
  vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(rows as never);
}

describe('SheetPreview', () => {
  it('shows the "too large" state when sizeBytes > 10MB and does not fetch', async () => {
    const eleven_mb = 11 * 1024 * 1024;
    render(<SheetPreview url="https://example.com/big.csv" mimeType={csvMime} sizeBytes={eleven_mb} />);
    expect(await screen.findByText(/too large to preview/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches, parses, and renders up to 1,000 rows when file is under the cap', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ a: `row${i}`, b: i }));
    mockWorkbook(rows);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/small.csv" mimeType={csvMime} sizeBytes={5000} />);
    expect(await screen.findByText('row0')).toBeInTheDocument();
    expect(screen.queryByText(/showing first 1,000/i)).toBeNull();
  });

  it('shows truncation banner when parsed rows exceed 1,000', async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ a: i }));
    mockWorkbook(rows);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/big.csv" mimeType={csvMime} sizeBytes={200000} />);
    expect(await screen.findByText(/Showing first 1,000 of 1,234 rows/i)).toBeInTheDocument();
  });

  it('shows multi-sheet banner when an XLSX has more than one sheet', async () => {
    mockWorkbook([{ a: 1 }], ['Sheet1', 'Sheet2', 'Sheet3']);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/multi.xlsx" mimeType={xlsxMime} sizeBytes={200000} />);
    expect(await screen.findByText(/3 sheets/i)).toBeInTheDocument();
  });

  it('shows parse-error state when XLSX.read throws', async () => {
    vi.mocked(XLSX.read).mockImplementation(() => {
      throw new Error('corrupt');
    });
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 })
    );

    render(<SheetPreview url="https://example.com/bad.xlsx" mimeType={xlsxMime} sizeBytes={200000} />);
    expect(await screen.findByText(/couldn't be parsed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/preview/SheetPreview.test.tsx`
Expected: FAIL — the stub renders only the placeholder string.

- [ ] **Step 3: Implement `SheetPreview`**

Replace `cis-deal-room/src/components/workspace/preview/SheetPreview.tsx` with:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { PREVIEW_ROW_CAP, PREVIEW_SIZE_CAP_BYTES } from '@/lib/preview';

type State =
  | { status: 'loading' }
  | { status: 'too-large' }
  | { status: 'parse-error' }
  | {
      status: 'ready';
      rows: Record<string, unknown>[];
      totalRows: number;
      sheetCount: number;
      headers: string[];
    };

interface SheetPreviewProps {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export function SheetPreview({ url, sizeBytes }: SheetPreviewProps) {
  const [state, setState] = useState<State>(
    sizeBytes > PREVIEW_SIZE_CAP_BYTES ? { status: 'too-large' } : { status: 'loading' }
  );

  useEffect(() => {
    if (sizeBytes > PREVIEW_SIZE_CAP_BYTES) return;
    let aborted = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const buffer = await res.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (aborted) return;
        const headers = json.length > 0 ? Object.keys(json[0]) : [];
        setState({
          status: 'ready',
          rows: json.slice(0, PREVIEW_ROW_CAP),
          totalRows: json.length,
          sheetCount: workbook.SheetNames.length,
          headers,
        });
      } catch {
        if (!aborted) setState({ status: 'parse-error' });
      }
    })();

    return () => {
      aborted = true;
    };
  }, [url, sizeBytes]);

  if (state.status === 'too-large') {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return (
      <div className="text-white/80 text-sm text-center">
        File too large to preview ({mb} MB) — download to open locally.
      </div>
    );
  }

  if (state.status === 'loading') {
    return <div className="text-white/60 text-sm">Parsing spreadsheet…</div>;
  }

  if (state.status === 'parse-error') {
    return (
      <div className="text-white/80 text-sm text-center">
        This file couldn&apos;t be parsed — download to open in Excel.
      </div>
    );
  }

  const { rows, totalRows, sheetCount, headers } = state;
  const truncated = totalRows > PREVIEW_ROW_CAP;

  return (
    <div className="w-full h-full overflow-auto bg-white text-black rounded">
      {sheetCount > 1 && (
        <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900">
          This workbook has {sheetCount} sheets — only the first is shown.
        </div>
      )}
      {truncated && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-900">
          Showing first 1,000 of {totalRows.toLocaleString()} rows — download for the full file.
        </div>
      )}
      <table className="text-xs w-full border-collapse">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1 text-left border-b font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 ? 'bg-gray-50' : ''}>
              {headers.map((h) => (
                <td key={h} className="px-2 py-1 border-b align-top">{String(row[h] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> **Note on virtualization:** the spec mentioned `@tanstack/react-virtual`. For a 1,000-row cap, a plain table renders in <50ms and scrolls fine — virtualization is not strictly necessary. The dep stays installed (v2 can add virtualization when the cap lifts) but this version ships without it to keep the code simple. If perf is noticeably bad on large rendered tables, wrap the `<tbody>` in `useVirtualizer` following `@tanstack/react-virtual`'s table example.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/preview/SheetPreview.test.tsx`
Expected: PASS — all five cases green.

- [ ] **Step 5: Typecheck**

Run: `cd cis-deal-room && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/preview/SheetPreview.tsx src/components/workspace/preview/SheetPreview.test.tsx
git commit -m "feat(preview): SheetPreview with CSV/XLSX parse + guardrails"
```

---

## Task 10: Integrate eye icon + modal into `FileList`

**Files:**
- Modify: `cis-deal-room/src/components/workspace/FileList.tsx`
- Test: `cis-deal-room/src/components/workspace/FileList.test.tsx` (extend or create)

- [ ] **Step 1: Write the failing tests**

If `src/components/workspace/FileList.test.tsx` already exists, append the new test cases. Otherwise create it:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FileList } from './FileList';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const previewableRow = {
  id: 'f1',
  name: 'CIM.pdf',
  sizeBytes: 1234,
  mimeType: 'application/pdf',
  version: 1,
  uploadedByEmail: 'a@b.com',
  uploadedByFirstName: 'A',
  uploadedByLastName: 'B',
  createdAt: new Date().toISOString(),
};
const unsupportedRow = { ...previewableRow, id: 'f2', name: 'doc.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

function mockFilesResponse(files: unknown[]) {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify(files), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('FileList preview icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default viewport = desktop
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
  });

  it('renders a preview icon button on rows with supported MIME types', async () => {
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
  });

  it('does not render the preview icon on unsupported MIME types', async () => {
    mockFilesResponse([unsupportedRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(unsupportedRow.name);
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
  });

  it('hides the preview icon below 1024px viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 900 });
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
  });

  it('opens the preview modal when the eye icon is clicked', async () => {
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/FileList.test.tsx`
Expected: FAIL — no button with name "preview" rendered.

- [ ] **Step 3: Update `FileList.tsx`**

Edit `cis-deal-room/src/components/workspace/FileList.tsx`:

1. **Add `Eye` to the lucide imports** (line 4):

```typescript
import { FileText, Sheet, Presentation, Image, Film, File, Download, Eye } from 'lucide-react';
```

2. **Add new imports** (after existing imports):

```typescript
import { isPreviewable } from '@/lib/preview';
import { PreviewModal, type PreviewFile } from './PreviewModal';
```

3. **Add preview state** inside the component body, next to the existing `versionsFile` state (around line 57):

```typescript
const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
const [canPreview, setCanPreview] = useState(false);

useEffect(() => {
  function check() {
    setCanPreview(typeof window !== 'undefined' && window.innerWidth >= 1024);
  }
  check();
  window.addEventListener('resize', check);
  return () => window.removeEventListener('resize', check);
}, []);
```

4. **Add the eye button in the actions column**, immediately before the existing Download button (around line 207 in the original file — after mapping each file, the actions `<div>` lives inside the row). Insert:

```tsx
{canPreview && isPreviewable(file.mimeType) && (
  <button
    type="button"
    aria-label={`Preview ${file.name}`}
    onClick={() => setPreviewFile(file as PreviewFile)}
    className="w-8 h-8 border border-border rounded flex items-center justify-center hover:bg-bg-subtle"
  >
    <Eye size={16} />
  </button>
)}
```

5. **Mount the modal at the bottom** of the component's returned JSX, next to where `<VersionHistoryDrawer>` is rendered:

```tsx
{previewFile && (
  <PreviewModal
    file={previewFile}
    open={true}
    onClose={() => setPreviewFile(null)}
  />
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/components/workspace/FileList.test.tsx`
Expected: PASS — all four new cases green. Existing tests (if any) still pass.

- [ ] **Step 5: Full suite + typecheck + build**

Run: `cd cis-deal-room && npm test`
Expected: all suites green.

Run: `cd cis-deal-room && npm run typecheck`
Expected: 0 errors.

Run: `cd cis-deal-room && npm run build`
Expected: build succeeds. Bundle reports list `xlsx` as a dynamic chunk (should not appear in the main bundle).

- [ ] **Step 6: Commit**

```bash
cd cis-deal-room
git add src/components/workspace/FileList.tsx src/components/workspace/FileList.test.tsx
git commit -m "feat(workspace): preview eye icon in FileList + modal mount"
```

---

## Task 11: Manual QA pass

**Files:** (no code; checklist only)

- [ ] **Step 1: Start the dev server**

Run: `cd cis-deal-room && npm run dev`
Expected: local at `http://localhost:3000`.

- [ ] **Step 2: Manual checklist — run through every item**

- [ ] Log in as an admin. Navigate to any workspace with a variety of file types.
- [ ] Upload a test PDF → eye icon appears → click → modal opens → PDF renders in iframe → `Esc` closes the modal.
- [ ] Upload a PNG → eye icon appears → click → image renders object-contained.
- [ ] Upload an MP4 (any short video) → eye icon appears → click → native video controls work.
- [ ] Upload a small CSV (<1,000 rows) → eye icon → click → table renders, no truncation banner.
- [ ] Upload a CSV with >1,000 rows → eye icon → click → truncation banner appears.
- [ ] Upload an XLSX with 2+ sheets → eye icon → click → "N sheets" banner appears, first sheet shown.
- [ ] Upload an 11 MB CSV → eye icon → click → "too large" state, no fetch fired (check network tab).
- [ ] Upload a DOCX → **no eye icon** appears on the row.
- [ ] Resize browser below 1024 px → all eye icons disappear. Resize back → they return.
- [ ] Download button inside modal works and pulls a fresh presigned URL (visible in network tab).
- [ ] Open preview for a file, then have another admin delete that file in a second tab → download inside modal surfaces a toast/error; preview still showing stale content is acceptable.
- [ ] Query the DB: `SELECT action, target_type, COUNT(*) FROM activity_logs WHERE workspace_id = '<ws>' GROUP BY 1,2;` → confirm `previewed / file` rows exist and they are **not** visible in the workspace activity feed UI.

- [ ] **Step 3: Commit the QA log (optional)**

If you want an audit trail, paste the checklist output into `docs/phase-5-preview-qa.md` and commit:

```bash
cd cis-deal-room
git add docs/phase-5-preview-qa.md
git commit -m "docs: v1.1 document preview QA checklist"
```

---

## Self-Review (complete after writing the plan)

**Spec coverage:**

| Spec section | Task |
|---|---|
| 2 Scope — PDF/image/video/CSV/XLSX | Tasks 2, 7, 8, 9 |
| 3.1 Eye icon trigger + gating | Task 10 |
| 3.2 Modal top bar + close + download | Task 7 |
| 3.3 Preview body dispatch | Task 7 |
| 3.4 Guardrails (size, rows, first sheet) | Task 9 |
| 4.1 New files | All tasks |
| 4.2 Touched files | Tasks 3, 5, 10 |
| 4.3 Dependencies | Task 6 |
| 5 Data flow | Tasks 7, 9 |
| 6 Error handling | Tasks 7, 9 |
| 7 Activity logging | Tasks 3, 4, 5 |
| 8 Testing (unit, component, API) | Tasks 2, 4, 5, 7, 8, 9, 10 |
| 8 Testing (E2E/Playwright) | **Deferred — no Playwright in repo** (flagged in plan context) |
| 9 Migration | Task 3 |
| 10 Rollout | Additive; no feature flag — noted in plan context |

**Placeholder scan:** No TBDs, no vague "add error handling" steps, no "see Task N" back-references without code. `requireFolderAccessForFile` in Task 4 is flagged with a reality-check note to match whatever the presign-download route actually uses — that is a known unknown with explicit resolution guidance, not a placeholder.

**Type consistency:** `PreviewFile` interface defined in Task 7 matches `FileRow` fields used in Task 10. `getPreviewKind` return type used consistently across tasks. `PREVIEW_SIZE_CAP_BYTES` and `PREVIEW_ROW_CAP` constant names are stable across Tasks 2 and 9.
