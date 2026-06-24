# Q&A + Workstreams — Context

**Gathered:** 2026-06-21
**Status:** Ready for research / planning
**Phasing:** Deferred — decide after research. Likely two phases (Q&A, then Workstreams) but captured here as one shared doc because the features are tightly coupled (Q&A lives inside a workstream).

<domain>
## Feature Boundary

Two new features for the CIS Deal Room, layered on the existing workspace/folder/participant model:

1. **Q&A module** — a structured due-diligence Q&A workflow. Buyers submit questions; sellers/advisors answer; CIS vets answers before release. Filterable question list + threaded detail view with one approved answer.
2. **Workstream-based organization** — a cross-cutting tag layer (Legal, Finance, Technology, HR, Commercial, …) over documents and Q&A, with a top-level view toggle, per-workstream overview dashboard, and membership-based access.

**Coupling:** Every Q&A question is created *inside a workstream*. The workstream is the question's category and the scope for its visibility/recipients. Build order should account for this — Workstreams provides the container Q&A depends on, though Q&A is the more standalone deliverable. Resolve the order during planning.

**Explicitly OUT of scope:**
- The broader **design rework** (deferred — user is researching first).
- **Tasks / task lists** — Feature 2's brief mentioned filtering "task lists" by workstream, but no task system exists in the codebase. Tasks are a separate, future feature, not part of this work.
</domain>

<decisions>
## Implementation Decisions

### Workstreams — core model
- **Orthogonal tag layer** over documents and Q&A. Folders are untouched: a document keeps its single folder home AND can carry workstream tags. No data duplication, no migration of the existing 8-folder model.
- **Many-to-many**: a document or Q&A item can belong to multiple workstreams (e.g., a key contract is both Legal and Commercial).
- **Seeded defaults, admin-editable**: each new deal auto-gets Legal, Finance, Technology, HR, Commercial (mirrors the 8 default-folder pattern). Admins can add/rename/remove workstreams per workspace.

### Workstreams — navigation & dashboard
- **Top-level view toggle**: "Workstreams" sits alongside Documents / Q&A / Users. Selecting a workstream re-lenses the workspace (docs, Q&A, activity filter to it) and opens its overview dashboard.
- **Overview dashboard** per workstream shows: document count, open/overdue Q&A count, recent activity scoped to the workstream, and quick links into its docs and Q&A. (No new aggregation infra required.)
- Visual indicators (workstream-specific icons / color tags) — left to design/implementation discretion.

### Workstreams — permissions
- **Membership grants access**: assigning a user to a workstream grants them access to all content tagged with that workstream, **layered on top of** existing per-folder access (union of access paths). A document may therefore be reachable via its folder OR its workstream — access logic must account for both.
- Admins / cis_team retain their existing implicit bypass.

### Q&A — placement & categorization
- A question is **created inside a workstream**; the workstream is its grouping/category. No separate category/topic taxonomy.
- A question can **optionally link to one specific existing document** ("re: this SPA draft") with a link back to it.

### Q&A — visibility
- Asker chooses per question:
  - **Public** — visible to all members of the question's workstream.
  - **Private** — asker selects specific recipients from a dropdown of that workstream's members.

### Q&A — lifecycle & approval
- Status flow: **new → assigned → answered → approved**.
- **Assignment**: asker proposes an assignee; **CIS confirms** (or reroutes).
- **Approval gate is driven by deal type** (`cisAdvisorySide`). Example: on a **sell-side** engagement, CIS approves answers given by the seller / seller-side designees before the answer is released to the asker. The buy-side case mirrors this. Approval routing should be derived from the engagement side, not configured per question.

### Q&A — answer shape & editor
- **Threaded conversation** (clarifications, follow-ups) **plus one designated "approved" answer** that is the official response.
- **Editor**: light formatting only — bold, italic, lists, links — plus **@mention of workstream members**. No headings/tables/inline images.
- **Attachments**: answers/questions may **link to files that already exist in a folder**. No file upload from within Q&A.

### Q&A — dates
- Asker optionally sets a **"response requested by"** date. Question records the asked date and the requested-by date. **Overdue** questions are visually flagged and filterable.

### Q&A — list view
- Filterable table showing status, assigned user, asked date, and requested-by date, with filters by **status, workstream, and assignee** (model on the existing `ChecklistTable` multi-filter pattern).

### Q&A — notifications
- **Standard set**, reusing the existing notification queue + digest:
  - New question → CIS / workstream responders.
  - Answer approved/released → asker.
  - Assignment confirmed → assignee.
- Respects each user's existing immediate-vs-digest preference (`notifyUploads` / `notifyDigest`). A dedicated Q&A opt-in toggle was considered but not required for v1.

### Claude's Discretion
- Rich-text editor library choice (e.g., TipTap / Lexical / Slate) and threaded-comment UI implementation.
- Workstream icon/color visual system.
- Exact activity-log action enums and notification email templates for Q&A and workstream events.
- Whether Q&A real-time updates use polling (consistent with the current 60s activity-feed poll) vs. anything richer.
</decisions>

<specifics>
## Specific Ideas

- Q&A list should feel like the existing `ChecklistTable` — a clear, filterable table.
- Q&A detail = threaded conversation + a single official answer, with the approval gate making the advisor-vetting workflow explicit.
- Private Q&A is a deliberate within-workstream recipient picker, not a free-for-all — the asker controls exactly who sees a sensitive question.
- Workstreams should feel like the folder/playbook seeding pattern users already know: sensible defaults out of the box, editable per deal.
</specifics>

<code_context>
## Existing Code Insights (from codebase scout)

### Reusable Assets
- **`ChecklistTable.tsx`** — closest analog to the Q&A list: useMemo-filtered rows + Set-based multi-select filters (category/priority/owner/status). Template for the Q&A table and filters.
- **`Modal.tsx`, `Input.tsx`, `Button.tsx`, `Badge.tsx`, `ChecklistStatusChip.tsx`, `ConfirmDialog.tsx`** — UI primitives for Q&A detail/compose modals and status pills.
- **Notification system** — `src/lib/notifications/enqueue-or-send.ts` (`enqueueOrSend`, channel + per-user prefs) + `notificationQueue` table + `src/app/api/cron/digest/route.ts`. Q&A events slot in as new channels/templates.
- **Activity logging** — `src/lib/dal/activity.ts` (`logActivity`, append-only, JSONB metadata, 27 action enums, transaction-safe). Add Q&A/workstream actions here; `ActivityFeed.tsx` already groups + paginates.
- **Email templates** — `src/lib/email/*` (react-email). Add Q&A notification templates alongside `invitation`, `upload-batch`, `daily-digest`, `checklist-assigned`.
- **Participant/member data** — `workspaceParticipants` + `folderAccess` give the member lists needed for the private-recipient picker and workstream membership.

### Established Patterns
- **DAL-first access control** — `verifySession()` at the data boundary; `requireDealAccess` / `requireFolderAccess` (`src/lib/dal/access.ts`); permission matrix in `src/lib/dal/permissions.ts` (`canPerform`). Workstream access must extend this with a workstream-membership access path (union with folder access).
- **Workspace shell view-switching** — `WorkspaceShell.tsx` uses a `CenterView` union (`overview | folder | checklist`). Add `qna` and `workstream` kinds; `FolderSidebar.tsx` "Overview"/"Checklist" tabs are the model for new top-level nav entries.
- **Route conventions** — Next.js Route Handlers under `src/app/api/*`, params as Promise, 401/403/400/500 codes; pages under `(app)` auth-gated group. New routes likely `/workspace/[id]/qna` and `/workspace/[id]/workstreams`.
- **Schema conventions** — Drizzle, `uuid().primaryKey().defaultRandom()`, `createdAt` always / `updatedAt` for mutable, soft-delete only on `files.deletedAt`, append-only `activityLogs`. New tables follow suit.

### Integration Points
- **Schema additions** (to be designed in research): workstreams + workstream membership + item↔workstream tag junctions (docs and Q&A); Q&A questions / answers / thread messages / recipients / document-link.
- **Permission layer** — workstream-grant access path added to `access.ts` access checks.
- **Nav** — new `CenterView` kinds + top-level toggle in `WorkspaceShell` / `FolderSidebar`.
- **Notifications + activity** — new action enums + templates + `enqueueOrSend` calls on Q&A/workstream events.

### Flags
- **No rich-text editor or threaded-comment UI exists** — Q&A introduces the first of each. Picking/wiring the editor library is real net-new work.
- **Folders are flat & exclusive today** — workstreams are the first cross-cutting dimension; the tag-layer model was chosen specifically to avoid disrupting this.
</code_context>

<deferred>
## Deferred Ideas

- **Overall design rework** — user is researching before making changes; revisit as its own effort.
- **Tasks / task lists** — referenced in the Workstreams brief but no task system exists; a separate future feature, out of scope here.
- **Rich workstream dashboard rollups** (e.g., diligence completion %) — needs workstreams wired into checklist data; a follow-on once both features land.
- **Dedicated per-user "Q&A notifications" opt-in toggle** — considered; not required for v1 (reuses existing immediate/digest prefs).
- **Phasing decision** (one combined phase vs. two; build order) — deferred to after research, per user.
</deferred>

---

*Features: Q&A module, Workstream-based organization*
*Context gathered: 2026-06-21*
