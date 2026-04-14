import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';

/**
 * Root route — redirects to the deal list when authed, login page otherwise.
 * Replaces the default Next.js scaffold landing page.
 */
export default async function RootPage() {
  const session = await verifySession();
  redirect(session ? '/deals' : '/login');
}
