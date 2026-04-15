# Document Preview — v1.1 Design

**Date:** 2026-04-15
**Milestone:** v1.1
**Status:** Draft — awaiting user review
**Source backlog item:** STATE.md — "Document preview — inline viewer for uploaded files"

---

## 1. Summary

Add an inline document preview modal to the workspace. Users with folder download access can click a preview (eye) icon in the file list to open a modal viewer without leaving the workspace, covering the file types that make up ~80%+ of M&A deal-room content today (PDFs, images, video, CSV, XLSX).

This ships **Slice A + Slice B** of the three-slice plan recorded in STATE.md. Slice C (DOCX/PPTX) is explicitly deferred.

## 2. Scope

### In scope

| Category | MIME types | Renderer |
|---|---|---|
| PDF | `application/pdf` | Native `<iframe>` on the presigned GET URL |
| Image | `image/png`, `image/jpeg`, `image/gif`, `image/webp` | Native `<img>` |
| Video | `video/mp4`, `video/webm` | Native `<video controls>` |
| CSV | `text/csv`, `application/csv` | SheetJS parse → virtualized table (first 1,000 rows) |
| XLSX | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | SheetJS parse first sheet → virtualized table |

### Out of scope (v1.1)

- DOCX, PPTX (Slice C — defer until usage data justifies the viewer cost)
- Preview of historical versions from the version drawer (drawer remains download-only)
- `next / previous file` navigation from within the modal
- Mobile/tablet preview (hidden below 1024 px; users download to view locally)
- Deep-linkable preview URLs (revisit post-launch if demand appears)
- Preview-event surfacing in the activity feed (logged silently for audit only)
- `d` keyboard shortcut for download, preview prefetch on hover, retry-after-session-renewal

## 3. User Experience

### 3.1 Entry point

A dedicated eye (preview) icon is added to the actions column of each file row in `FileList`, to the left of the existing download icon. The icon is:

- **Shown** only for files whose MIME type matches the supported set above.
- **Hidden** below a 1,024 px viewport (consistent with the Phase 4 "graceful mobile read-only" policy).
- **Unchanged** for unsupported types — the row stays download-only.

Filename, v-chip (opens version drawer), and download icon behavior are all preserved.

### 3.2 Modal layout

Clicking the eye icon opens a singleton modal overlay (`PreviewModal`) over the workspace. The modal has a single top bar with:

- File icon + filename
- v-chip (e.g., `v2`) — non-interactive in the modal; drawer access remains on the row
- Metadata: size, uploader display name
- Download button (fresh presigned URL per click; fires `fetchWithAuth` against the existing `presign-download` route)
- Close button

`Esc` closes. No prev/next file navigation. No folder-wide file index.

### 3.3 Preview body

The body renders one of `PdfPreview`, `ImagePreview`, `VideoPreview`, or `SheetPreview` based on `getPreviewKind(mimeType)`.

### 3.4 Guardrails (CSV / XLSX only)

- **Size cap:** file must be ≤ **10 MB**. Larger → "File too large to preview — download to open locally." state; no fetch fired.
- **Row cap:** first **1,000 rows** per sheet. Banner: *"Showing first 1,000 of {N} rows — download to view the full file."*
- **Sheet cap:** first sheet only (XLSX workbooks). Banner: *"This workbook has {N} sheets — only the first is shown."*

Image and video have no size cap (browsers lazy-render; bandwidth is the user's concern).

## 4. Architecture

### 4.1 New files

| Path | Purpose |
|---|---|
| `src/components/workspace/PreviewModal.tsx` | Modal shell. Top bar, close / download / `Esc` handling, MIME dispatch. |
| `src/components/workspace/preview/PdfPreview.tsx` | `<iframe src={url}>` |
| `src/components/workspace/preview/ImagePreview.tsx` | `<img src={url}>` with object-fit: contain |
| `src/components/workspace/preview/VideoPreview.tsx` | `<video controls src={url}>` |
| `src/components/workspace/preview/SheetPreview.tsx` | SheetJS parse + virtualized table. Handles CSV + XLSX. |
| `src/lib/preview.ts` | Pure helpers: `isPreviewable()`, `getPreviewKind()`, `PREVIEW_SIZE_CAP_BYTES`, `PREVIEW_ROW_CAP`. |
| `src/app/api/files/[id]/log-preview/route.ts` | POST — records a `file_previewed` activity row. Fire-and-forget from the client. |

### 4.2 Touched files

| Path | Change |
|---|---|
| `src/components/workspace/FileList.tsx` | Add eye icon button in actions column, gated on `isPreviewable` + viewport width. Manage `previewFile` state and mount `PreviewModal`. |
| `src/db/schema.ts` | Add `'file_previewed'` to the `activity_type` enum. Migration. |
| Activity feed query (existing DAL / API that backs the Phase 4 feed) | Add `WHERE activity_type != 'file_previewed'` so silent events stay out of the UI feed. |

### 4.3 Dependencies

- `xlsx` (SheetJS community, MIT) — ~400 KB gz. Code-split via dynamic `import()` inside `SheetPreview`; bundle only loads on first CSV/XLSX preview.
- `@tanstack/react-virtual` — <10 KB gz. Same dynamic-import treatment.

### 4.4 Reused infrastructure

- **Presigned download route** — `/api/files/[id]/presign-download` is reused as-is. Preview and download share the same 15-minute TTL presigned URL endpoint and the same `requireFolderAccess(can: 'download')` gate.
- **Activity logging** — existing `logActivity()` helper.
- **`fetchWithAuth` + toast / 401 redirect pipeline** — existing; no changes.

## 5. Data Flow

```
User clicks eye icon on a file row
  ↓
FileList setState { previewFile: file }
  ↓
PreviewModal mounts (open=true)
  ↓
PreviewModal fetches GET /api/files/{id}/presign-download  via fetchWithAuth
  ↓ { url, fileName }
  ↓
Route by getPreviewKind(file.mimeType):
    'pdf'   → <iframe src={url}>
    'image' → <img src={url}>
    'video' → <video controls src={url}>
    'sheet' →  if sizeBytes > 10MB   → "too large" state (skip fetch)
               else                   → fetch(url) → arrayBuffer
                                     → dynamic import('xlsx') + parse
                                     → first sheet, first 1,000 rows
                                     → render table + banners
  ↓
On first successful render (once per modal open) → POST /api/files/{id}/log-preview (fire-and-forget)
  ↓
User hits Esc or Close → PreviewModal unmounts; any in-flight SheetJS work is abandoned.
```

### Download button inside modal

Triggers `GET /api/files/{id}/presign-download` on every click (fresh URL each time; safe even past 15 min of modal lifetime). Opens via the existing `<a download>` pattern from `FileList`.

### Authorization

- `presign-download` enforces `requireFolderAccess(can: 'download')` (existing).
- `log-preview` re-runs the same check — defense in depth; the client is not trusted to only POST when it actually rendered.

## 6. Error Handling

All errors render **inside the modal**, not as toasts, so the user sees context with the failure.

| Failure | Trigger | UI | Recovery |
|---|---|---|---|
| `presign-download` → 401 | Session expired | (Global `fetchWithAuth` interceptor toasts + redirects to `/login?returnTo=…` — Phase 4 behavior; modal does not render its own state.) | Handled globally |
| `presign-download` → 403 | Access revoked mid-session | *"You no longer have access to this file."* | Close only |
| `presign-download` → 404 | File deleted by admin | *"This file no longer exists."* | Close only |
| `presign-download` → 5xx / network | Server down | *"Couldn't load preview — please try again."* | Retry + Download fallback |
| `<iframe>` / `<img>` / `<video>` `onError` | S3 hiccup, CORS edge case | *"Couldn't load preview — download instead."* | Download + Close |
| SheetJS parse throw | Corrupt XLSX, malformed CSV | *"This file couldn't be parsed — download to open in Excel."* | Download + Close |
| `sizeBytes > 10 MB` (sheet) | Pre-fetch guardrail | *"File too large to preview ({N} MB) — download to open locally."* | Download + Close |
| Parsed rows > 1,000 (sheet) | After parse | Top-of-table banner: *"Showing first 1,000 of {N} rows — download for the full file."* | Continue |
| `SheetNames.length > 1` (XLSX) | After parse | Top banner: *"This workbook has {N} sheets — only the first is shown."* | Continue |

### Edge cases

- **MIME type missing / `application/octet-stream`** — `getPreviewKind()` returns `null`; eye icon never renders. No preview attempt.
- **File renamed mid-preview** — modal holds the file snapshot from click time; renames in the list don't affect the open modal.
- **File deleted mid-preview by another admin** — download button hits a 404; existing `fetchWithAuth` error handling surfaces a toast.
- **Presigned URL >15 min old** — refresh/reload would fail, but the download button re-presigns per click.
- **Concurrent previews** — impossible by construction; the eye icon is behind the modal.

## 7. Activity Logging

Add `'file_previewed'` to the `activity_type` enum (schema migration). Log via the existing `logActivity()` helper with payload `{ activityType: 'file_previewed', fileId, workspaceId, actorUserId }`.

**Feed suppression:** the activity feed query filters out `file_previewed` rows so they don't surface in the UI. Rows remain queryable for audit / compliance.

## 8. Testing Strategy

### Unit tests (vitest)

| File | Coverage |
|---|---|
| `tests/lib/preview.test.ts` | `isPreviewable()` + `getPreviewKind()` across all supported MIMEs, unsupported MIMEs, `null`/`undefined`, `application/octet-stream`. Cap constants. |
| `tests/components/PreviewModal.test.tsx` | Renders correct child per MIME. Close + `Esc` fire `onClose`. Download button calls `onDownload`. Top bar renders filename + v-chip + metadata. |
| `tests/components/SheetPreview.test.tsx` | Too-large banner when sizeBytes > 10 MB (no fetch fired). Row-truncation banner when rows > 1,000. Multi-sheet banner. Parse-error state. `xlsx` mocked. |
| `tests/components/FileList.test.tsx` (extend) | Eye icon visible only for previewable MIMEs. Hidden below 1,024 px (matchMedia mock). Click opens modal with correct file. |

### API tests (vitest + msw)

| File | Coverage |
|---|---|
| `tests/api/files-log-preview.test.ts` | 401 unauth. 403 no folder access. 404 file gone. 200 writes a `file_previewed` row with correct actor/file/workspace. |
| `tests/api/activity-feed.test.ts` (extend) | `file_previewed` rows in the test DB are **not** returned by the feed query. |

### E2E (playwright)

| File | Coverage |
|---|---|
| `tests/e2e/preview.spec.ts` | Upload PDF → eye icon appears → click → modal shows → `Esc` closes. Upload image → preview renders. Upload 20 KB CSV → table renders with banner if truncated. Upload DOCX → no eye icon. |

### Out of scope

- Cross-browser iframe PDF rendering (browser concern, not app concern)
- SheetJS parsing accuracy beyond "doesn't throw on our fixtures"
- Video playback beyond "video element mounts"

### Manual QA checklist

- [ ] Real PDF loads in iframe on Chrome, Firefox, Safari
- [ ] 10 MB+ CSV shows the "too large" state without fetching
- [ ] XLSX with 3 sheets shows the "first sheet only" banner
- [ ] Revoke access mid-preview → next preview attempt shows the 403 state
- [ ] <1024 px viewport hides eye icons
- [ ] Activity row is written to DB but not shown in the feed

## 9. Migration

Single schema migration adds `'file_previewed'` to the `activity_type` PostgreSQL enum. No data backfill; no destructive changes.

## 10. Rollout

Feature is additive — no existing flow changes when the icon isn't clicked. Direct merge to `main`; no feature flag needed.

## 11. Open Questions

None at spec-finalization time. See Section 12 for implementation deltas discovered during QA.

## 12. Implementation Deltas

- **PDF rendering** — spec called for native browser iframe. During QA, Chrome and Safari both refused to render cross-origin PDFs inline inside `<iframe>` or `<object>`. Shipped with `react-pdf` + `pdfjs-dist` instead — renders to canvas, reliable cross-browser. Worker script loaded from `cdn.jsdelivr.net` at runtime (v1.2 backlog: self-host under `/public` for CSP hardening). ~1.8 MB code-split chunk loads only on first PDF preview.
- **Presign-download query parameter** — added `?disposition=inline` to `/api/files/[id]/presign-download`. Controls the `Content-Disposition` header on the signed S3 URL and gates the `downloaded` activity log. Modal uses `inline` (preview path); Download button and all other callers default to `attachment` (unchanged behavior). When `disposition=inline`, the route also sets `ResponseContentType: file.mimeType` on the GetObjectCommand to force Chrome to treat octet-stream uploads as their declared MIME.
- **`next.config.ts`** — added `serverExternalPackages: ['pdfjs-dist']` and `experimental.optimizePackageImports: ['react-pdf']` to unblock Next.js 16 SSR bundling for the PDF renderer.
- **`xlsx` install** — installed from the SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-<VERSION>/xlsx-<VERSION>.tgz`) rather than npm, to avoid the npm-published 0.18.x prototype-pollution CVE. Code imports unchanged.
- **`@tanstack/react-virtual`** — planned for XLSX virtualization but not needed at the 1,000-row cap. Removed before merge.
- **E2E Playwright tests** — spec listed a `tests/e2e/preview.spec.ts`. Deferred to v1.2 (no Playwright setup in repo). Unit + component + API tests give strong coverage of the preview dispatch, guardrails, and logging paths; the gap is real-browser render verification.
