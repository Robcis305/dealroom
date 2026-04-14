import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

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

  return (
    <>
      <Toaster
        position="top-right"
        theme="light"
        toastOptions={{
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          },
        }}
      />
      {children}
    </>
  );
}
