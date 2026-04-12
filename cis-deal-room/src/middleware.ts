import { type NextRequest, NextResponse } from 'next/server';

/**
 * Public paths that do not require authentication.
 * All other paths redirect unauthenticated users to /login.
 */
const PUBLIC_PATHS = ['/login', '/auth/verify'];

/**
 * IMPORTANT: This middleware performs UX-only cookie presence checks.
 * It is NOT the security gate.
 *
 * Security enforcement happens in verifySession() (src/lib/dal/index.ts),
 * which is called at the data boundary in every protected DAL function.
 *
 * This pattern is required post-CVE-2025-29927: middleware cannot be trusted
 * to enforce authorization because middleware.ts runs in a different execution
 * context and can be bypassed. The DAL is the actual gate.
 *
 * Reference: https://nextjs.org/blog/cve-2025-29927
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without any session check
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // UX redirect: if no cis_session cookie, send to login
  // NOTE: This is a UX convenience only. verifySession() in the DAL enforces
  // real session validity. An attacker with a forged/expired cookie here
  // will be rejected by verifySession() before touching any data.
  const sessionCookie = request.cookies.get('cis_session');

  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - API routes (auth enforcement is in the DAL, not middleware)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
