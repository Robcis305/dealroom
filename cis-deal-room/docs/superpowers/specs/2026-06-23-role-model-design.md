# Role Model Redesign — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending spec review
**Phase:** 1 of 3 in the onboarding redesign (Role model → Admin deal setup → Participant onboarding). This spec covers ONLY the shared role-model foundation. The Admin-setup and Participant-onboarding flows are separate specs that build on this.

## Problem

The deal room has 8 live participant roles (`client`, `seller_rep`, `buyer_rep`, `seller_counsel`, `buyer_counsel`, `cis_team`, `view_only`, + deprecated `counsel`). It's unclear which to pick, which are required, and what each can do. Inviting people is confusing (you can pick the wrong side), and a pre-existing "No active Client participant" banner nags even when the deal has active members. This is the root cause behind several reported issues.

## Goal

Replace the 8-role model with a **5-role, side-relative** model where "buyer vs seller" is derived from the deal's advisory side, with an explicit permission matrix, a safe migration of existing data, and removal of the Client-required banner.

---

## The role model

Five participant roles plus an internal global Admin. Roles are **side-relative** — the literal buyer/seller is derived from `workspaces.cisAdvisorySide`, never chosen per person.

| Role (enum value) | Who | Side (derived) |
|---|---|---|
| **CIS Team** (`cis_team`) | Internal CIS advisors running the deal | internal |
| **Client** (`client`) | The principal CIS represents (execs/employees) | CIS's side |
| **Client Counsel** (`client_counsel`) | The client's lawyers | CIS's side |
| **Counterparty** (`counterparty`) | The other side **and** their counsel | other side |
| **View-only** (`view_only`) | Passive observer (board, lender) | any |
| *Admin* (`admin`) | Global CIS superuser (cross-deal); also a valid participant role meaning "CIS Team" within a deal | internal |

**Side derivation (display only):** given a role + `cisAdvisorySide`, the UI may show a concrete label — e.g. on a `seller_side` deal, Client renders as "Client (Seller)" and Counterparty as "Counterparty (Buyer)". This is presentational; stored roles are always the side-relative enum value.

**Active enum set after this change:** `admin`, `cis_team`, `client`, `client_counsel`, `counterparty`, `view_only`. The old values (`seller_rep`, `buyer_rep`, `seller_counsel`, `buyer_counsel`, `counsel`) are **deprecated**: no rows reference them after migration and they're not offered in the invite UI, but they remain dormant in the pgEnum (no risky enum-recreate).

## Permission matrix

| Capability | CIS Team | Client | Client Counsel | Counterparty | View-only |
|---|---|---|---|---|---|
| Manage deal (invite, roles, status, folders) | ✅ | — | — | — | — |
| Manage workstream members / tag documents | ✅ | — | — | — | — |
| Approve / reroute Q&A (CIS gate) | ✅ | — | — | — | — |
| Upload documents | ✅ | ✅ | ✅ | — | — |
| Download / view documents | granted | granted | granted | only shared | only granted |
| Cap table | full | full | full | **published only** | published only |
| Checklist (edit status) | ✅ | ✅ | ✅ | — | — |
| Q&A — ask / chat | ✅ | ✅ | ✅ | ✅ | — |
| Q&A — give official **Answer** | ✅ | if assignee | if assignee | if assignee | — |
| Be a workstream member | ✅ | ✅ | ✅ | ✅ | — |

Notes:
- "Manage" (deal admin, workstream management, Q&A approval) = **CIS Team role OR global Admin** — exactly the `isCisTeamOrAdmin` helper already shipped. No other role manages.
- **Document access** remains governed by the existing per-folder `folder_access` grants **unioned** with workstream membership (already built). The matrix's "granted/only shared/only granted" describes the *ceiling*; folder grants are the actual gate. Only **upload** is restricted by role (CIS/Client/Client Counsel only).
- **Only active (accepted) participants** can be added as workstream members or assigned a Q&A answer. Invited-but-not-accepted participants are not eligible.

## Affected code

- `src/db/schema.ts` + `src/types/index.ts` — add `client_counsel`, `counterparty` to `participantRoleEnum` / `ParticipantRole`; mark the four `*_rep`/`*_counsel` + `counsel` as deprecated in comments.
- `src/lib/dal/permissions.ts` (`canPerform`) — upload allowed for `cis_team`/`client`/`client_counsel`/`admin`; download allowed for all roles that have folder access (gate stays folder-level); `view_only`/`counterparty` cannot upload.
- `src/lib/dal/cap-table.ts` (`applyCapTableVisibilityGate`) — full visibility for `cis_team`/`client`/`client_counsel`/`admin`; `counterparty` and `view_only` see **published only**. Remove the `viewOnlyShadowSide` branch.
- `src/lib/dal/checklist.ts` (`ownerFilterForSession` / owner mapping) — map the new roles to checklist owner sides (Client side ↔ the deal's client; Counterparty ↔ other side). Update any `SELLER_SIDE_ROLES`-style sets to the new role names.
- Q&A: `createQuestion`/`postMessage` should reject `view_only` (can't ask/chat); answer/approve gates already use assignee + `isCisTeamOrAdmin`.
- Workstream membership (`addWorkstreamMember`) + the members modal — restrict eligible members to **active, non-view-only** participants.
- `src/components/workspace/ParticipantFormModal.tsx` — offer the 5 roles with side-relative labels; drop the deprecated options.
- `src/components/workspace/ParticipantList.tsx` and any role-label rendering — show new role labels (with derived side suffix where useful).
- `src/components/workspace/WorkspaceShell.tsx` + `src/app/(app)/workspace/[workspaceId]/page.tsx` — **remove the "No active Client participant" banner** and the `countActiveClientParticipants` usage/prop. (Keep the DAL fn or delete if unused elsewhere.)
- Retire `workspaceParticipants.viewOnlyShadowSide` (and `viewOnlyShadowSideEnum`): stop reading it; a migration drops the column (or leaves it nullable+unused if dropping is risky — implementer's call in the plan).

## Migration (0018)

A hand-written `0018_role_model.sql` + idempotent `apply-0018-direct.mjs` (repo convention):

1. `ALTER TYPE participant_role ADD VALUE IF NOT EXISTS 'client_counsel'` and `'counterparty'`.
2. Backfill `workspace_participants.role`, side-aware via the owning workspace's `cis_advisory_side`:
   - `seller_rep` → `client` if `seller_side` else `counterparty`
   - `buyer_rep` → `client` if `buyer_side` else `counterparty`
   - `seller_counsel` → `client_counsel` if `seller_side` else `counterparty`
   - `buyer_counsel` → `client_counsel` if `buyer_side` else `counterparty`
   - `counsel` (deprecated, no side) → `view_only` (least privilege)
   - `cis_team`, `client`, `view_only`, `admin` → unchanged
3. Verify: no remaining rows on deprecated roles; print a summary count per new role.
4. (Optional, same migration or follow-up) drop `view_only_shadow_side` column once code no longer reads it.

Apply to **each** environment DB (local, preview, production) — they are separate databases with no auto-migrate, per the deploy reference.

## Out of scope (later phases / separate specs)

- **Admin deal-setup flow** (Phase 2) — guided/streamlined deal creation + initial invites.
- **Participant onboarding flow** (Phase 3) — invite→accept→first-run experience, and the **dashboard-counts bug** (the workstream detail endpoint returns the raw row without counts, so stat cards render blank) — fixed there.
- Ask-a-question recipient/assignee pickers already filter to participants; they inherit the active-only rule here but any further polish is Phase 3.

## Testing

- Unit: `canPerform` per new role (upload allowed/denied); cap-table gate per new role (counterparty/view-only = published only); checklist owner filter mapping; `createQuestion` rejects view_only; membership eligibility rejects invited/view_only.
- Migration: a script-level verify asserting zero deprecated-role rows post-backfill and correct side-aware mapping on a seeded sample.
- Gates: `npm test`, `npm run typecheck`, `npm run build`.

## Rollout

Branch → PR → preview. Because role changes touch authorization, the final whole-branch review must confirm no over-grant. Apply `0018` to preview before testing and to production at merge.
