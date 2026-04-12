---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + React Testing Library (RTL) |
| **Config file** | `vitest.config.ts` — Wave 0 creates this |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~5–10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01 | 01 | 0 | AUTH-01 | unit | `npx vitest run src/lib/auth/tokens.test.ts` | ❌ W0 | ⬜ pending |
| 1-02 | 01 | 0 | AUTH-02 | unit | `npx vitest run src/lib/auth/tokens.test.ts` | ❌ W0 | ⬜ pending |
| 1-03 | 01 | 1 | AUTH-02 | unit | `npx vitest run src/app/api/auth/verify/route.test.ts` | ❌ W0 | ⬜ pending |
| 1-04 | 01 | 1 | AUTH-03 | unit | `npx vitest run src/lib/auth/session.test.ts` | ❌ W0 | ⬜ pending |
| 1-05 | 01 | 1 | AUTH-06 | unit | `npx vitest run src/lib/auth/rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 1-06 | 02 | 1 | WORK-01, FOLD-01 | unit | `npx vitest run src/lib/dal/workspaces.test.ts` | ❌ W0 | ⬜ pending |
| 1-07 | 02 | 2 | FOLD-02 | unit | `npx vitest run src/lib/dal/folders.test.ts` | ❌ W0 | ⬜ pending |
| 1-08 | 02 | 2 | ACTY-01 | unit | `npx vitest run src/lib/dal/activity.test.ts` | ❌ W0 | ⬜ pending |
| 1-09 | 03 | 2 | UI-05 | component | `npx vitest run src/components/auth/LoginForm.test.tsx` | ❌ W0 | ⬜ pending |
| 1-10 | 03 | 2 | UI-05 | component | `npx vitest run src/app/auth/verify/page.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest config with jsdom environment for component tests
- [ ] `src/test/setup.ts` — shared test setup (db mocking, session mocking)
- [ ] `src/lib/auth/tokens.test.ts` — stubs for AUTH-01, AUTH-02 token generation and hashing
- [ ] `src/lib/auth/session.test.ts` — stubs for AUTH-03 session sliding window and expiry
- [ ] `src/lib/auth/rate-limit.test.ts` — stubs for AUTH-06 (mock Upstash Redis)
- [ ] `src/lib/dal/workspaces.test.ts` — stubs for WORK-01, FOLD-01
- [ ] `src/lib/dal/folders.test.ts` — stubs for FOLD-02
- [ ] `src/lib/dal/activity.test.ts` — stubs for ACTY-01
- [ ] `src/components/auth/LoginForm.test.tsx` — stubs for UI-05 state machine
- [ ] `src/app/auth/verify/page.test.tsx` — stubs for UI-05 verify error states
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Magic link email actually arrives | AUTH-01 | External email delivery (Resend) cannot be asserted in unit tests | Send test login request with valid email; verify email arrives in inbox within 30s |
| Three-panel layout visual rendering | UI-02, UI-07 | Layout and brand styling (dark aesthetic, CIS red) is visual; no DOM assertion captures it | Load `/workspace/[id]` in browser; verify sidebar + file list + right panel visible with correct colors |
| Magic link click redirects to deal list | AUTH-02 | Requires live browser + real cookie set | Click link from email; verify redirect to `/deals`; verify authenticated state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
