import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';

/**
 * verifySession() — the DAL entry point for all protected data access.
 *
 * IMPORTANT: This is the actual auth gate (post-CVE-2025-29927 pattern).
 * Middleware is UX-only redirect. This function enforces auth at the data boundary.
 *
 * Wrapped in React cache() so multiple calls within a single request
 * share the same session lookup (deduplication).
 */
export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('cis_session')?.value;
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  return session; // null if expired or not found
});
