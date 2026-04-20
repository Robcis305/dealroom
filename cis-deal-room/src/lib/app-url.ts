/**
 * Returns the public origin this deployment is reachable at.
 *
 * On Vercel preview deployments, prefer VERCEL_BRANCH_URL so emails and
 * redirects land back on the same preview a tester is using (not production).
 * Production and local dev fall back to NEXT_PUBLIC_APP_URL / localhost.
 */
export function getAppUrl(): string {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/**
 * Origins accepted by the CSRF same-origin check.
 *
 * Always includes NEXT_PUBLIC_APP_URL (canonical production) when set. On
 * Vercel, also accepts VERCEL_BRANCH_URL and VERCEL_URL so previews can
 * submit forms to their own backend without needing env-var-per-branch.
 */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      origins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // ignore malformed value; other sources may still provide a valid origin
    }
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  return Array.from(origins);
}
