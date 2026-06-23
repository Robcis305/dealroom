# Workspace Sync — Admin-only Local Mirror Download

**Date:** 2026-05-15
**Status:** Design approved, ready for plan
**Scope:** v1.7 candidate

## Problem

CIS advisors (admins) want to keep a local mirror of a workspace's files on their Mac for offline native-app review — markup in Word/Excel/Preview, work without internet, search in Finder. Today they either click through files one-at-a-time or use the `/api/files/download-zip` endpoint with a manual file-id selection. Neither preserves the data room's folder structure on disk, and neither tells them "what's new since last time."

The complementary problem: when a seller adds new files mid-diligence, the advisor wants to grab only the new ones, not re-download the whole thing.

## Goals

- One-click download of a workspace as a ZIP that mirrors the data room's folder tree.
- Admin-only — non-admins do not see this feature.
- Incremental sync — "download new files since my last sync" returns only the new files in a small ZIP, with folder paths preserved so the user can extract on top of their existing local copy.
- Surfaces context: last-synced timestamp, count of new files, total bytes — so the user knows what they're about to download.
- Reuses existing infrastructure (`archiver` streaming, S3 client, filename sanitization) rather than parallel implementations.

## Non-goals (deferred to backlog)

- Client-confirmation watermark advance. v1 advances on stream-end; if a download succeeds but the user's machine crashes before extracting, the watermark is lost.
- Cross-deal sync page. v1 is per-workspace only.
- Handling renames/moves. If a file moves between folders after sync, the local copy stays in the old path. Not re-downloaded.
- Handling deletes. Soft-deletes in the data room do not remove local files.
- Async/queued zip generation for workspaces over the file cap. v1 errors and asks the user to use the folder picker.
- Mac CLI helper for true rsync-style sync. v1 is browser-only.
- Templated folder structures (user-defined working folders layered on top of the data room mirror).

## User experience

### Trigger

In the workspace header, admin-only, a new **Download** button appears next to **Upload**. Non-admins do not see this button.

### Modal

Clicking Download opens a modal pre-filled with manifest data:

- Header: "Download workspace"
- Sub-line: workspace name + "Last synced: [date]" or "Never synced"
- Primary stat block: when there are new files, "[N] new files since [date] · [size]". When never synced, "[N] files · [size] total".
- Three actions:
  - **Download new** — visible only if `lastSyncedAt` exists and there are new files. Primary CTA in that case.
  - **Download everything** — always visible. Primary CTA when never synced.
  - **Pick folders…** — expands an inline checkbox list of top-level folders with per-folder counts and sizes. Mirrors the UX of the user's existing shell-script picker.

If the manifest reports the workspace exceeds the cap (>1000 files), the modal shows a warning banner: "This workspace has [N] files — Download everything is disabled. Use Pick folders to select a subset." `Download everything` is disabled in that state; `Download new` and `Pick folders…` remain available. When using `Pick folders…`, the modal sums file counts client-side from the manifest's `folderTree` and disables the confirm button if the selection exceeds 1000 — so the over-cap 400 from the zip endpoint is a defense-in-depth check, not the primary UX gate.

### Download

Clicking any action POSTs to the zip endpoint. The browser receives a streaming ZIP response (`Content-Disposition: attachment`). User double-clicks the downloaded file to extract.

The downloaded zip name is `[Workspace Name] - [YYYY-MM-DD HHmm].zip` (e.g. `Project Chronos - 2026-05-15 1430.zip`) — sortable, distinguishable across syncs.

### ZIP layout

Mirrors the data room's folder tree exactly:

```
Project Chronos/
  Financials/
    Q3 Financials.xlsx
    Q3 Financials [v2].xlsx          # files.version > 1
    2023 Statements/
      Income statement.pdf
  Legal/
    NDA template.docx
```

Rules:

- Root folder = workspace name, sanitized (strip `/` `:` `\` control chars; trim leading `.`; cap at 100 chars).
- Path separator = `/` (zip spec; macOS/Windows/Linux all extract correctly).
- Version suffix: files with `version > 1` get ` [v2]`, ` [v3]`, etc. inserted before the extension. `Q3.xlsx` → `Q3 [v2].xlsx`. v1 files stay plain so they match the seller's filenames.
- Filename collisions inside the same folder (rare — different file rows with the same name and same version): apply the existing `(2)`, `(3)` disambiguation pattern from `/api/files/download-zip`.
- Sanitize each filename and folder name (strip path separators, control characters) using a shared helper.

## Architecture

### Two endpoints

**`GET /api/workspaces/[id]/sync/manifest`** — admin-only, read-only.

Response:

```ts
{
  workspaceName: string;
  lastSyncedAt: string | null;        // ISO timestamp; null = never synced
  totalFiles: number;
  totalBytes: number;
  newSinceLastSync: {
    count: number;
    bytes: number;
  } | null;                            // null if lastSyncedAt is null
  folderTree: Array<{
    folderId: string;
    name: string;
    fileCount: number;
    bytes: number;
    children: FolderTreeNode[];        // recursive
  }>;
  overCap: boolean;                    // totalFiles > 1000
}
```

**`POST /api/workspaces/[id]/sync/zip`** — admin-only, streaming.

Body:

```ts
{
  mode: 'full' | 'incremental';
  folderIds?: string[];                // top-level folder ids; if omitted, all folders
}
```

Response: `Content-Type: application/zip`, streamed via `archiver` over a `ReadableStream`, same pattern as the existing `/api/files/download-zip` endpoint.

Server pipeline:

1. `verifySession()`; reject if not admin (403).
2. Look up watermark from `workspace_user_syncs` (mode = `incremental`).
3. Build file query:
   - `workspaceId = :id`
   - `deletedAt IS NULL`
   - `confirmedAt IS NOT NULL` (only confirmed uploads, not in-progress)
   - If `mode = incremental` and watermark exists: `createdAt > watermark`
   - If `folderIds` provided: file's folder must be in `folderIds` or a descendant of one of them
4. If selected file count exceeds 1000, return 400 `{ error: 'Selection exceeds 1000 files. Use folder picker to narrow.' }`.
5. Resolve folder paths for each file (build a folder-id → full-path map once, then look up per file).
6. Stream the ZIP. For each file:
   - GET object from S3
   - Append to archive with entry name `[workspaceName]/[folderPath]/[filename-with-version-suffix-if-needed]`
   - Apply disambiguation if entry name already taken in the zip
7. On `archive.finalize()` success, in the same handler, UPSERT into `workspace_user_syncs` with `last_synced_at = now()`.
8. Log activity: `download_workspace_sync` with `{ fileCount, bytes, mode, folderIdsCount }`.

### Watermark advance semantics

- Watermark advances **only after `archive.finalize()` succeeds** and the watermark UPSERT commits.
- If the stream aborts mid-flight (network drop, Vercel timeout, archiver error), the watermark is NOT advanced — user can retry and receive the same file set.
- The watermark UPSERT happens inside the stream handler before `controller.close()`. If the UPSERT fails, the response still completes (user has the bytes) but the watermark is stale — next sync will re-include the same files. Tolerable; logged as an error.

### Data model

New table:

```sql
CREATE TABLE workspace_user_syncs (
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX idx_workspace_user_syncs_workspace ON workspace_user_syncs (workspace_id);
```

No `updated_at` — the `last_synced_at` column is the only mutable value and represents the same concept.

### File selection query

In `lib/dal/workspace-sync.ts`:

```ts
getWorkspaceFilesForSync(params: {
  workspaceId: string;
  sinceWatermark?: Date;             // omit for full mode
  folderIds?: string[];              // omit for all folders
}): Promise<Array<{
  fileId: string;
  s3Key: string;
  filename: string;
  version: number;
  folderId: string;
  bytes: number;
  createdAt: Date;
}>>
```

When `folderIds` is provided, the query expands to include descendant folders (recursive CTE on `folders.parent_folder_id`).

### Components

New:

- `cis-deal-room/src/app/api/workspaces/[id]/sync/manifest/route.ts`
- `cis-deal-room/src/app/api/workspaces/[id]/sync/zip/route.ts`
- `cis-deal-room/src/lib/dal/workspace-sync.ts`
- `cis-deal-room/src/lib/files/zip-helpers.ts` — extracted shared `sanitizeForZipEntry()` and `disambiguateName()` (refactored out of the existing `download-zip/route.ts`)
- `cis-deal-room/src/components/workspace/WorkspaceSyncModal.tsx`
- `cis-deal-room/src/components/workspace/WorkspaceSyncButton.tsx` — the header button + modal trigger; admin-only via session check
- Drizzle migration `0016_workspace_user_syncs.sql` + Drizzle journal entry

Modified:

- `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` — mount `<WorkspaceSyncButton />` in the header next to the existing `UploadModal` trigger.
- `cis-deal-room/src/db/schema.ts` — add `workspaceUserSyncs` table definition.
- `cis-deal-room/src/app/api/files/download-zip/route.ts` — extract sanitize + disambiguate helpers into `lib/files/zip-helpers.ts`; import from there.
- `cis-deal-room/src/lib/dal/activity.ts` — add `download_workspace_sync` to the activity type enum.

### Runtime config

The zip route mirrors the existing endpoint:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;       // up from 60 — Vercel Pro plan supports this
```

The 1000-file cap combined with 300s timeout gives ~3MB/sec average throughput headroom for a worst-case full sync. Typical incremental syncs finish in under 10s.

## Failure modes

| Scenario | Behavior |
|---|---|
| User not admin | 403 from both endpoints; button never rendered |
| Workspace has 0 files | Modal shows "Workspace is empty"; all actions disabled |
| Incremental requested, nothing new | Modal disables `Download new`, points user to `Download everything` |
| Selection over 1000 files | Manifest's `overCap = true`; zip endpoint returns 400 with explanatory message |
| Stream aborts mid-flight | Watermark NOT advanced; activity row NOT written; user retries |
| Watermark UPSERT fails after successful stream | Response succeeds; error logged; next sync re-includes the same files |
| File's S3 object missing | Skip the file, append a `MISSING_FILES.txt` entry at zip root listing skipped files; continue stream; do not 500. Watermark still advances on stream-end — missing files are a server-side data issue, not a user-retry case. |
| Two concurrent downloads by same user on same workspace | Both complete; last-writer-wins on watermark UPSERT; both users get their bytes |

## Testing

**DAL tests** (`workspace-sync.test.ts`):

- `getWorkspaceFilesForSync` returns correct set under each combination of `sinceWatermark` and `folderIds`
- Recursive folder expansion when `folderIds` is provided (parent folder picks up nested children)
- Excludes soft-deleted files
- Excludes unconfirmed uploads
- Version-suffix logic: `version: 1` → no suffix; `version: 2+` → ` [vN]` suffix before extension; file with no extension handled correctly

**Manifest endpoint integration tests**:

- Never-synced workspace returns `lastSyncedAt: null`, `newSinceLastSync: null`
- Workspace with prior sync and new files returns correct count + bytes
- Workspace at 1001 files returns `overCap: true`
- Non-admin gets 403

**Zip endpoint integration tests** (do not assert on byte contents — just entry list + headers + watermark advance):

- Full mode: returns all confirmed non-deleted files, watermark advances to ~now
- Incremental mode after prior sync: returns only files with `createdAt > watermark`, watermark advances
- Folder picker: returns only files in selected folders (including descendants)
- Over-cap selection: returns 400, watermark unchanged
- Non-admin: 403

**Manual smoke test**: download from a real workspace, extract the zip on macOS, verify:

- Top-level folder name matches workspace name
- Nested folder structure matches data room
- Versioned files appear with `[v2]` suffix where expected
- Filenames with special characters extract cleanly

## Open backlog items

To be added to the deferred queue in `project_deal_room.md` after v1 ships:

- Client-confirmation watermark advance (explicit "I got it" before bumping)
- Cross-deal sync page (admin dashboard with per-workspace sync buttons + "sync all")
- Rename/move handling (re-download moved files, optionally remove from old path)
- Delete propagation (mark file as deleted-on-server in a manifest sidecar; user decides whether to delete local)
- Async/queued zip generation for workspaces over 1000 files (background job + notify when ready)
- Mac CLI helper (true rsync-style additive sync)
- Templated working folders layered on top of the data room mirror
