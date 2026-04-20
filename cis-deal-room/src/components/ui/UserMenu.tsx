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
