import { getAllowedOrigins } from '@/lib/app-url';

/**
 * Rejects state-changing requests whose Origin/Referer is not one of the
 * app's allowed origins. Origin is required for fetch()/XHR from modern
 * browsers; falls back to Referer. Returns false when neither header is
 * present — we do not serve state-changing requests from unknown origins,
 * including curl/older bots.
 *
 * The allowlist covers NEXT_PUBLIC_APP_URL plus Vercel preview URLs
 * (VERCEL_BRANCH_URL, VERCEL_URL) when deployed on Vercel.
 */
export function isSameOriginRequest(request: Request): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;

  const header = request.headers.get('origin') ?? request.headers.get('referer');
  if (!header) return false;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(header).origin;
  } catch {
    return false;
  }

  return allowed.includes(requestOrigin);
}
