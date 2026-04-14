# Phase 3 Checkpoint — Human Verification

Before calling Phase 3 complete, walk through this checklist end-to-end in a
browser. Everything in the list should behave as described. Flag anything that
does not.

## Prerequisites

- `DATABASE_URL` set in `.env.local` and migrations applied (`npx drizzle-kit migrate`)
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `RESEND_API_KEY` optional — stub mode logs email payloads to the server console
- Dev server running: `npm run dev`
- You are logged in as an admin (`users.isAdmin = true`)
- At least one workspace exists with the default 8 folders

## Checklist

### Participant invitation

- [ ] Open a workspace. In the right panel, click **Participants**.
- [ ] Click **Invite Participant**. The modal shows role options including "Seller Rep" (for a buyer-side deal) or "Buyer Rep" (sell-side) — not both.
- [ ] Submit an invitation with a test email, role "Client", and two folder checkboxes ticked.
- [ ] Server console shows `[email:stub]` payload (stub mode) OR you receive the email (live Resend).
- [ ] A new row appears in the Participants list with status "Invited".
- [ ] In a private browser window, open the magic link from the email (or log from server).
- [ ] You land directly in the deal workspace (not the deal list) and the participant row flips to "Active".

### Folder access enforcement

- [ ] Still as the invited participant, the folder sidebar only shows the two folders you were granted access to — not all 8.
- [ ] Upload a file to one of the granted folders — succeeds.
- [ ] Attempt to manually `POST /api/files/presign-upload` via `curl` against a folder you were NOT granted access to — returns 403.

### Upload batch notification

- [ ] As the original admin user, upload 3 files in a single session to a folder that the invited participant has download access to.
- [ ] After all 3 uploads complete, server console shows ONE `[email:stub]` payload addressed to the invited participant (not three).
- [ ] The email preview header shows "3 new files in <folder name>".

### Edit and remove

- [ ] As admin, click the Edit (pencil) icon next to a participant. The modal opens. (Folder access checkboxes start empty in v1 — documented limitation.)
- [ ] Change the role to "Counsel" and save. The participant row label updates.
- [ ] Click Remove (×). Confirm the prompt. The row disappears.
- [ ] As the removed participant (still logged in in the other browser), navigate anywhere in that workspace — every API request to `/workspaces/<id>/*` returns 403.

### Self-edit guards

- [ ] Try to edit your own admin participant row — change role to "Client". Server returns 400 "Cannot demote self".
- [ ] Try to remove yourself — server returns 400 "Cannot remove self".

### Negative paths

- [ ] Invite an email that already has an invited participant row in this workspace → succeeds (re-invite, token refreshed, no duplicate row).
- [ ] Invitation link used twice → second click returns "already used" error page.
- [ ] Invitation link after 3 days → returns "expired" error.

## Sign-off

| Area | Status | Notes |
|---|---|---|
| Invitation flow | ☐ | |
| Folder access enforcement | ☐ | |
| Batch notification | ☐ | |
| Edit / Remove | ☐ | |
| Self-edit guards | ☐ | |
| Negative paths | ☐ | |

When all boxes are ticked, update `.planning/STATE.md` to mark Phase 3 complete
and write it up in `.planning/phases/03-collaboration/SUMMARY.md`.
