# User Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a `/settings` page with two toggles (`notify_uploads`, `notify_digest`) so they can re-subscribe after using an email unsubscribe link, and a working link to it from the unsubscribe confirmation and the avatar menu.

**Architecture:** New Server Component at `src/app/(app)/settings/page.tsx` reads current prefs from `users` via `verifySession()` + a direct DB select, then renders a client component `NotificationPreferencesForm` that POSTs `/api/user/preferences` on toggle change. The existing inline "Daily digest" checkbox in `UserMenu` is replaced with a "Settings" link to `/settings`. The `/api/unsubscribe` HTML confirmation is updated to include a real anchor to `/settings`.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), Drizzle ORM, Vitest, React 19, Tailwind, `sonner` toasts, `fetchWithAuth` client helper.

---

## Scope & Non-Goals

**In scope:**
- Route `/settings` (App Router, `(app)` route group — session-gated by the same DAL layer as `/deals`)
- Two toggles: "Email me when files are uploaded" (`notify_uploads`) and "Send a daily digest instead of instant emails" (`notify_digest`)
- Server-rendered initial state from the `users` row
- Remove inline "Daily digest" toggle from `UserMenu`; add "Settings" link to `/settings`
- Update `/api/unsubscribe` HTML to link to `/settings`
- Tests: page render, client form POSTs correct shape, unsubscribe page contains the link

**Out of scope:** profile editing, password flows (magic-link only), per-folder prefs, admin-only settings, workspace-level prefs. Flag these as follow-ups, do not build.

## File Structure

```
cis-deal-room/src/
  app/
    (app)/
      settings/
        page.tsx                          # Server Component: reads prefs, renders form
    api/
      unsubscribe/
        route.ts                          # MODIFY — add <a href="/settings">
  components/
    settings/
      NotificationPreferencesForm.tsx     # Client Component: toggles + POST
  components/ui/
    UserMenu.tsx                          # MODIFY — drop digest toggle, add Settings link
  test/
    api/
      unsubscribe.test.ts                 # (co-located at src/app/api/unsubscribe/route.test.ts) — add link assertion
  components/settings/
    NotificationPreferencesForm.test.tsx  # New — form POSTs expected body on toggle
  app/(app)/settings/
    page.test.tsx                         # New — page renders with session, redirects without
```

Each file has one clear responsibility:
- `page.tsx` is the server data boundary (session + DB read + initial render).
- `NotificationPreferencesForm.tsx` owns client interactivity and the POST.
- `UserMenu.tsx` change is subtractive + a single new `<a>` — keeps the file small.
- `unsubscribe/route.ts` change is a one-line HTML tweak + a test for the anchor.

---

## Task 1: Settings page scaffold + server-side data fetch (failing test first)

**Files:**
- Create: `cis-deal-room/src/app/(app)/settings/page.tsx`
- Create: `cis-deal-room/src/app/(app)/settings/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `cis-deal-room/src/app/(app)/settings/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));

const mockDbResult = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockDbResult(),
        }),
      }),
    }),
  },
}));

const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

import { verifySession } from '@/lib/dal/index';
import SettingsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  redirectCalls.length = 0;
});

describe('SettingsPage (Server Component)', () => {
  it('redirects to /login when no session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectCalls).toEqual(['/login']);
  });

  it('renders the form with the user\u2019s current preferences', async () => {
    vi.mocked(verifySession).mockResolvedValue({
      sessionId: 's1',
      userId: 'u1',
      userEmail: 'a@b.com',
      isAdmin: false,
    });
    mockDbResult.mockResolvedValue([{ notifyUploads: false, notifyDigest: true }]);

    const tree = await SettingsPage();
    const { container } = render(tree);
    expect(container.textContent).toContain('Notification preferences');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/app/\(app\)/settings/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Write minimal implementation**

Create `cis-deal-room/src/app/(app)/settings/page.tsx`:

```tsx
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/index';
import { db } from '@/db';
import { users } from '@/db/schema';
import { Logo } from '@/components/ui/Logo';
import { NotificationPreferencesForm } from '@/components/settings/NotificationPreferencesForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const [row] = await db
    .select({
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <div className="min-h-screen bg-bg">
      <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
        <Logo size="sm" />
        <span className="text-sm font-semibold text-text-primary flex-1">Settings</span>
      </header>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-text-primary mb-4">Notification preferences</h1>
        <NotificationPreferencesForm
          initialNotifyUploads={row?.notifyUploads ?? true}
          initialNotifyDigest={row?.notifyDigest ?? false}
        />
      </div>
    </div>
  );
}
```

This import will fail typecheck until Task 2 creates `NotificationPreferencesForm`. That's expected — we'll fix it in the next task. The test will also fail until Task 2 is done.

- [ ] **Step 4: Leave tests red, commit page scaffold + test**

Run: `cd cis-deal-room && git add src/app/\(app\)/settings/page.tsx src/app/\(app\)/settings/page.test.tsx`

```bash
cd cis-deal-room
git commit -m "feat(settings): scaffold /settings page with failing tests"
```

---

## Task 2: NotificationPreferencesForm client component

**Files:**
- Create: `cis-deal-room/src/components/settings/NotificationPreferencesForm.tsx`
- Create: `cis-deal-room/src/components/settings/NotificationPreferencesForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `cis-deal-room/src/components/settings/NotificationPreferencesForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => mockFetch(input, init),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { NotificationPreferencesForm } from './NotificationPreferencesForm';

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('NotificationPreferencesForm', () => {
  it('renders both toggles reflecting the initial values', () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={false}
        initialNotifyDigest={true}
      />
    );
    const uploads = screen.getByLabelText(/upload/i) as HTMLInputElement;
    const digest = screen.getByLabelText(/daily digest/i) as HTMLInputElement;
    expect(uploads.checked).toBe(false);
    expect(digest.checked).toBe(true);
  });

  it('POSTs notifyUploads when the uploads toggle is flipped', async () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={false}
        initialNotifyDigest={false}
      />
    );
    const uploads = screen.getByLabelText(/upload/i);
    fireEvent.click(uploads);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/user/preferences');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ notifyUploads: true });
  });

  it('POSTs notifyDigest when the digest toggle is flipped', async () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={true}
        initialNotifyDigest={false}
      />
    );
    const digest = screen.getByLabelText(/daily digest/i);
    fireEvent.click(digest);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({ notifyDigest: true });
  });

  it('reverts optimistic state when the POST fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={true}
        initialNotifyDigest={false}
      />
    );
    const uploads = screen.getByLabelText(/upload/i) as HTMLInputElement;
    fireEvent.click(uploads);
    await waitFor(() => expect(uploads.checked).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/components/settings/NotificationPreferencesForm.test.tsx`
Expected: FAIL — `Cannot find module './NotificationPreferencesForm'`

- [ ] **Step 3: Write minimal implementation**

Create `cis-deal-room/src/components/settings/NotificationPreferencesForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Props {
  initialNotifyUploads: boolean;
  initialNotifyDigest: boolean;
}

type FieldKey = 'notifyUploads' | 'notifyDigest';

export function NotificationPreferencesForm({
  initialNotifyUploads,
  initialNotifyDigest,
}: Props) {
  const [notifyUploads, setNotifyUploads] = useState(initialNotifyUploads);
  const [notifyDigest, setNotifyDigest] = useState(initialNotifyDigest);
  const [saving, setSaving] = useState<FieldKey | null>(null);

  async function update(field: FieldKey, nextValue: boolean) {
    const revert = () => {
      if (field === 'notifyUploads') setNotifyUploads(!nextValue);
      else setNotifyDigest(!nextValue);
    };
    if (field === 'notifyUploads') setNotifyUploads(nextValue);
    else setNotifyDigest(nextValue);
    setSaving(field);
    try {
      const res = await fetchWithAuth('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextValue }),
      });
      if (!res.ok) {
        revert();
        toast.error('Failed to update preference');
      } else {
        toast.success('Preference updated');
      }
    } catch {
      revert();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-sm text-text-primary cursor-pointer">
        <input
          type="checkbox"
          checked={notifyUploads}
          disabled={saving === 'notifyUploads'}
          onChange={(e) => update('notifyUploads', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Email me when files are uploaded</span>
          <span className="block text-xs text-text-muted">
            Sent for folders you have access to. Turn off to stop receiving upload emails.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-text-primary cursor-pointer">
        <input
          type="checkbox"
          checked={notifyDigest}
          disabled={saving === 'notifyDigest'}
          onChange={(e) => update('notifyDigest', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Send a daily digest instead of instant emails</span>
          <span className="block text-xs text-text-muted">
            When on, upload notifications are batched into one daily email.
          </span>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cis-deal-room && npx vitest run src/components/settings/NotificationPreferencesForm.test.tsx src/app/\(app\)/settings/page.test.tsx`
Expected: 6 tests pass (4 form, 2 page).

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/components/settings/NotificationPreferencesForm.tsx src/components/settings/NotificationPreferencesForm.test.tsx
git commit -m "feat(settings): notification preferences client form"
```

---

## Task 3: Simplify UserMenu — drop inline toggle, add Settings link

**Files:**
- Modify: `cis-deal-room/src/components/ui/UserMenu.tsx`
- Modify: `cis-deal-room/src/app/(app)/deals/page.tsx` (callers no longer need to pass `notificationDigest`)
- Modify: `cis-deal-room/src/components/workspace/WorkspaceShell.tsx` (same)

- [ ] **Step 1: Write the failing test**

Create `cis-deal-room/src/components/ui/UserMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UserMenu } from './UserMenu';

describe('UserMenu', () => {
  it('shows a Settings link pointing at /settings when opened', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    const link = screen.getByRole('link', { name: /settings/i });
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('does not render any daily-digest checkbox', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    expect(screen.queryByLabelText(/daily digest/i)).toBeNull();
  });

  it('still renders the sign-out button', () => {
    render(<UserMenu userEmail="a@b.com" />);
    fireEvent.click(screen.getByLabelText(/user menu/i));
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/components/ui/UserMenu.test.tsx`
Expected: FAIL — the component still requires `notificationDigest` prop and renders the checkbox.

- [ ] **Step 3: Rewrite UserMenu**

Replace the full contents of `cis-deal-room/src/components/ui/UserMenu.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';

interface UserMenuProps {
  userEmail: string;
}

/**
 * User avatar button that opens a dropdown with:
 * - The user's email (for disambiguation)
 * - Settings link (pointing to /settings)
 * - Sign out (POSTs /api/auth/logout -> clears cookie -> redirects to /login)
 *
 * Rendered in the header of both the deal list and inside a workspace.
 */
export function UserMenu({ userEmail }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // even if the request fails, still navigate away - the cookie's max-age has been wiped server-side
    }
    window.location.href = '/login';
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-surface-sunken border border-border text-text-primary text-xs font-semibold flex items-center justify-center hover:bg-surface-elevated transition-colors"
        aria-label="User menu"
      >
        {userEmail.charAt(0).toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-lg shadow-md min-w-[240px] overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-border-subtle">
              <p className="text-xs text-text-muted truncate">{userEmail}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-elevated"
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-elevated disabled:opacity-50 text-left"
            >
              <LogOut size={14} />
              {signingOut ? 'Signing out\u2026' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Fix the two callers that still pass `notificationDigest`**

In `cis-deal-room/src/app/(app)/deals/page.tsx`, remove the `users` import path for `notificationDigest`, the `userRow` query, and the prop. Replace the existing `<UserMenu ... />` and the surrounding imports so the top of the file reads:

```tsx
import { getWorkspacesForUser } from '@/lib/dal/workspaces';
import { verifySession } from '@/lib/dal';
import { DealList } from '@/components/deals/DealList';
import { ReturnToHandler } from '@/components/auth/ReturnToHandler';
import { Logo } from '@/components/ui/Logo';
import { UserMenu } from '@/components/ui/UserMenu';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  const workspaces = await getWorkspacesForUser();

  return (
    <div className="min-h-screen bg-bg">
      <ReturnToHandler />
      <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
        <Logo size="sm" />
        <span className="text-sm font-semibold text-text-primary flex-1">Deal Rooms</span>
        <UserMenu userEmail={session.userEmail} />
      </header>
      <div className="p-6 max-w-6xl mx-auto">
        <DealList workspaces={workspaces} isAdmin={session.isAdmin} />
      </div>
    </div>
  );
}
```

In `cis-deal-room/src/components/workspace/WorkspaceShell.tsx`:
- Find the `UserMenu` call on line ~161 and change it from `<UserMenu notificationDigest={notificationDigest} userEmail={userEmail} />` to `<UserMenu userEmail={userEmail} />`.
- Remove the `notificationDigest` prop from `WorkspaceShell`'s own props interface and function signature (search the file for `notificationDigest` and delete every reference). Propagate the removal up to the caller: search for `<WorkspaceShell` across `cis-deal-room/src` with grep:

```bash
cd cis-deal-room && grep -rn 'notificationDigest' src/ --include='*.ts' --include='*.tsx'
```

Delete every `notificationDigest={...}` prop on `WorkspaceShell`, and delete the corresponding server-side DB select that computed it in the workspace page (e.g. `src/app/(app)/workspace/[workspaceId]/page.tsx` if that's where it's fetched — check with the grep above).

- [ ] **Step 5: Run the full test suite**

Run: `cd cis-deal-room && npx vitest run`
Expected: all tests pass. If `UserMenu`'s old test exists and still references `notificationDigest`, delete it — the new `UserMenu.test.tsx` replaces it.

- [ ] **Step 6: Typecheck**

Run: `cd cis-deal-room && npx tsc --noEmit`
Expected: no output (clean).

If the typecheck surfaces a `notificationDigest` reference you missed, remove it and re-run.

- [ ] **Step 7: Commit**

```bash
cd cis-deal-room
git add src/components/ui/UserMenu.tsx src/components/ui/UserMenu.test.tsx src/app/\(app\)/deals/page.tsx src/components/workspace/WorkspaceShell.tsx
# plus any other files modified by step 4's grep-driven cleanup
git commit -m "feat(settings): replace inline digest toggle with Settings link"
```

---

## Task 4: Unsubscribe HTML links to /settings

**Files:**
- Modify: `cis-deal-room/src/app/api/unsubscribe/route.ts`
- Modify: `cis-deal-room/src/app/api/unsubscribe/route.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cis-deal-room/src/app/api/unsubscribe/route.test.ts` (inside the existing `describe` block, after the last `it`):

```ts
  it('includes an anchor to /settings so the user can re-enable', async () => {
    const { signUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    const res = await GET(new Request(`http://localhost/api/unsubscribe?t=${t}`));
    const html = await res.text();
    expect(html).toContain('href="/settings"');
    expect(html.toLowerCase()).toContain('re-enable');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cis-deal-room && npx vitest run src/app/api/unsubscribe/route.test.ts`
Expected: FAIL — the HTML has text "account settings" but no `href="/settings"` anchor.

- [ ] **Step 3: Update the route's HTML response**

In `cis-deal-room/src/app/api/unsubscribe/route.ts`, replace the `return new Response(...)` block (lines 21-24) with:

```ts
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h1>Unsubscribed</h1><p>You won't receive further ${payload.channel} emails. You can <a href="/settings">re-enable this in your settings</a>.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cis-deal-room && npx vitest run src/app/api/unsubscribe/route.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd cis-deal-room
git add src/app/api/unsubscribe/route.ts src/app/api/unsubscribe/route.test.ts
git commit -m "feat(unsubscribe): link confirmation page to /settings"
```

---

## Task 5: End-to-end verification + PR

- [ ] **Step 1: Full test suite**

Run: `cd cis-deal-room && npx vitest run`
Expected: all previous tests still pass plus the ~10 new ones from Tasks 1-4. Total should be 270+.

- [ ] **Step 2: Typecheck**

Run: `cd cis-deal-room && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `cd cis-deal-room && npm run build`
Expected: success. Confirm the build log lists `/settings` as a route.

- [ ] **Step 4: Manual smoke (local dev)**

Run: `cd cis-deal-room && npm run dev`

Then in a browser:
1. Sign in.
2. Click the avatar menu → click Settings → land on `/settings` showing both checkboxes with your current DB values.
3. Toggle one checkbox → toast appears → refresh the page → the new value persists.
4. Visit `/api/unsubscribe?t=<fresh-valid-token>` (or click the link in a real email) → confirmation page shows the "re-enable this in your settings" link → click it → lands on `/settings`.
5. Navigate to `/settings` when signed out (clear `cis_session` cookie) → redirected to `/login`.

- [ ] **Step 5: Push branch and open PR**

```bash
cd cis-deal-room
git push -u origin feat/user-settings-page
```

Open PR with `gh pr create` using this body:

```
## Summary
- New `/settings` page with two toggles (`notify_uploads`, `notify_digest`) wired to the existing `POST /api/user/preferences` endpoint.
- Avatar dropdown now links to `/settings` instead of showing an inline digest checkbox.
- Unsubscribe confirmation page links back to `/settings` so users can re-enable after clicking an email unsubscribe link.

## Test plan
- [x] `npx vitest run` — all tests pass (existing + ~10 new)
- [x] `npx tsc --noEmit` clean
- [x] `npm run build` succeeds, `/settings` in the route list
- [ ] After deploy: toggle each checkbox, confirm persistence, confirm unsubscribe link on the email confirmation page resolves to `/settings`
```

---

## Self-Review Checklist (run before handing off)

1. **Spec coverage:**
   - `/settings` route gated like `/deals` → Task 1 page uses `verifySession()` + `redirect('/login')`.
   - Two toggles for `notify_uploads` and `notify_digest` → Task 2 form.
   - Server-rendered initial state → Task 1 page passes `initialNotifyUploads`/`initialNotifyDigest`.
   - Remove inline digest toggle from `UserMenu`, add Settings link → Task 3.
   - Unsubscribe page links to `/settings` → Task 4.

2. **Placeholder scan:** none.

3. **Type consistency:**
   - `NotificationPreferencesForm` prop names: `initialNotifyUploads`, `initialNotifyDigest` — used identically in Tasks 1 and 2.
   - `UserMenu` prop: `userEmail` only (digest prop removed) — consistent across Task 3 callers.
   - API body shape: `{ notifyUploads: boolean }` or `{ notifyDigest: boolean }` — matches `prefsSchema` in `src/app/api/user/preferences/route.ts:7-11` (which accepts each as optional).
