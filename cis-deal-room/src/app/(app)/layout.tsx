import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';
import type { ReactNode } from 'react';

/**
 * Auth-gated layout for the main app route group.
 * Calls verifySession() at the data boundary (post-CVE-2025-29927 pattern).
 * Middleware handles UX redirect; this is the real auth gate.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}
