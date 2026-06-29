# Magic-link / invite scanner resilience — design

**Date:** 2026-06-29
**Status:** Approved, ready for implementation plan

## Problem

Invite and login magic links are single-use and are consumed on a plain `GET`
to `/api/auth/verify` ([route.ts:57](../../../src/app/api/auth/verify/route.ts)).
The handler deletes the token row, upserts the user, activates participants, and
creates a session — all on the first GET, with no confirmation step and no bot
filtering.

Corporate email security gateways (Microsoft Defender Safe Links / ATP, Mimecast,
Proofpoint) **pre-fetch every URL in inbound mail** to scan it. That automated GET
consumes the token before the human clicks. The human then gets
*"This link has already been used"*
([page.tsx:21](../../../src/app/auth/verify/page.tsx)). Reissuing fails the same
way because each new email is scanned again.

**Diagnostic signature (matches the Project Avelia report):** the failure is
persistent **for all users sharing one email domain** — they share a corporate
mail gateway doing the scanning — and reissued links fail identically.

Secondary effect: each scanner hit currently creates an orphan `users` row and
`sessions` row (the cookie goes to the bot and is discarded).

## Goal

Make the magic-link flow resilient to automated link prefetching without
weakening the single-use, email-bound token contract or changing token lifetimes
(invite = 3 days, login = 10 minutes).

## Chosen approach: confirmation interstitial

Split the single consuming `GET` into a **non-consuming GET** plus a **consuming
POST** gated behind an explicit user action. Scanners issue GETs and do not click
the confirm button, so prefetch can no longer burn the token. This is the
industry-standard fix (Slack, Auth0, etc.) and beats both delivery-time and
click-time scanners — unlike User-Agent filtering, which is fragile and silently
regresses.

Rejected alternatives:
- **Reusable token until expiry** — no extra click, but a 3-day replayable invite
  link is a real exposure to anyone who captured it (including scanner logs).
- **Bot User-Agent filtering** — brittle; scanner UAs go stale and spoof browsers.

## Flow

Email links are **unchanged** — both builders keep pointing at
`/api/auth/verify?token=…&email=…`
([send/route.ts:60](../../../src/app/api/auth/send/route.ts),
[participants/route.ts:124](../../../src/app/api/workspaces/[id]/participants/route.ts)).
This keeps already-sent, in-flight invites working through the new flow.

1. **`GET /api/auth/verify`** — validate-only, **never mutates**.
   - Rate-limit by IP (unchanged).
   - Validate token via shared helper (hash → lookup → expiry → email-binding).
   - **Does not** delete the token, upsert the user, or create a session.
   - Valid → `302` to `/auth/verify?token=…&email=…` (confirm page).
   - `used` / `expired` / `invalid` / `rate_limited` → `302` to
     `/auth/verify?error=…` (today's behavior, same error codes).
   - The current expired-row delete side-effect ([route.ts:44](../../../src/app/api/auth/verify/route.ts))
     is removed so GET is strictly read-only. Expired rows are cleaned on the
     POST path or replaced on re-issue.

2. **`/auth/verify` page** ([page.tsx](../../../src/app/auth/verify/page.tsx))
   - With `token` + `email` and no `error` → render a **"Confirm sign-in"**
     button: a form that POSTs `token` + `email` to `/api/auth/verify`.
   - With `error=…` → render the existing error message for each code
     (`used`, `expired`, `invalid`, `rate_limited`). No visual change to this path.

3. **`POST /api/auth/verify`** — the **only** consuming path.
   - Re-validate via the shared helper (state may have changed since GET).
   - Delete the token row (single-use), upsert the user, activate `invited`
     participants, create the session, set the `cis_session` cookie, and redirect
     to `/complete-profile` / invite `redirectTo` / `/deals` — i.e. the current
     [route.ts](../../../src/app/api/auth/verify/route.ts) logic, moved verbatim.
   - First POST wins; a double-click second POST finds no row → `error=used`
     (acceptable — the first already established the session).

## Shared validation helper

Extract `validateMagicLinkToken(rawToken, email)` into a new
`src/lib/auth/verify-token.ts` returning a discriminated result:

```ts
type VerifyResult =
  | { ok: true; tokenRow: MagicLinkTokenRow }
  | { ok: false; error: 'used' | 'expired' | 'invalid' };
```

It performs hash → lookup → expiry → email-binding and **never deletes**. Both
GET (early error UX) and POST (before consuming) call it. Only POST performs the
`db.delete` + downstream mutations. Single source of truth for the rules.

Mapping of current branches to error codes (preserved):
- no row → `used`
- `expiresAt < now` → `expired`
- email mismatch (case-insensitive) → `invalid`

## Middleware / public paths

`/auth/verify` and `/login` are already public
([proxy.ts:7](../../../src/proxy.ts)). Confirm that `POST /api/auth/verify` is
reachable pre-authentication (the GET already is); adjust the public-path allowlist
if the proxy guards API routes.

## Testing

- **`route.test.ts`** — GET no longer consumes: assert the token row **still
  exists** after GET and that a valid GET redirects to the confirm page. Move all
  consume / session / participant-activation assertions to **new POST tests**.
  Keep `used` / `expired` / `invalid` / `rate_limited` cases on GET.
- **`page.test.tsx`** — with `token` + `email`: renders the Confirm button and the
  POST form targeting `/api/auth/verify`. With `error=…`: still renders each error
  message.
- **New** `verify-token.test.ts` — helper returns correct result for valid / used
  (missing) / expired / email-mismatch inputs, and never deletes.
- **Headline regression test** — two GETs followed by a POST still logs in
  (simulates scanner-prefetch-then-human). This is the test that proves the fix.

## Residual risk

A rare "detonation" sandbox that auto-submits HTML forms could still POST and
consume the token. The token (unguessable, single-use, email-bound) remains the
real protection; the interstitial defeats the common prefetch scanners, which is
the actual failure here. Token lifetimes are unchanged.

## Out of scope

- Q&A deep-links and document quick-links (#34/#35) require an authenticated
  session, not a token — an unauthenticated scanner is just bounced to login and
  consumes nothing. No change needed.
- No schema/migration changes; `magic_link_tokens` is untouched.
