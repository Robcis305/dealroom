import { toast } from 'sonner';

/**
 * Thin fetch wrapper that intercepts 401 responses and redirects to
 * /login with a returnTo pointing at the current URL. Toasts the user
 * before the redirect.
 *
 * Use this instead of the global `fetch` in every client component that
 * makes authenticated calls.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      const current = window.location.pathname + window.location.search;
      toast.error('Session expired — please sign in again');
      window.location.href = `/login?returnTo=${encodeURIComponent(current)}`;
    }
    throw new Error('Session expired');
  }
  return res;
}
