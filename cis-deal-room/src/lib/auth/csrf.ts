/**
 * Rejects state-changing requests whose Origin/Referer is not the app origin.
 * Origin is required for fetch()/XHR from modern browsers; falls back to Referer.
 * Returns false (reject) when neither header is present — we do not serve
 * state-changing requests from unknown origins, including curl/older bots.
 */
export function isSameOriginRequest(request: Request): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(appUrl).origin;
  } catch {
    return false;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (origin) {
    try {
      return new URL(origin).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}
