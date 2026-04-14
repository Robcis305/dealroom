import { getWorkspacesForUser } from '@/lib/dal/workspaces';
import { verifySession } from '@/lib/dal';
import { DealList } from '@/components/deals/DealList';
import { ReturnToHandler } from '@/components/auth/ReturnToHandler';
import { redirect } from 'next/navigation';

/**
 * Deals list page — Server Component.
 * Fetches workspaces and session, then passes data to the client DealList.
 */
export default async function DealsPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  let workspaces: Awaited<ReturnType<typeof getWorkspacesForUser>> = [];
  try {
    workspaces = await getWorkspacesForUser();
  } catch {
    // If fetch fails after session check, show empty state
    workspaces = [];
  }

  return (
    <div className="min-h-screen bg-bg">
      <ReturnToHandler />
      <DealList workspaces={workspaces} isAdmin={session.isAdmin} />
    </div>
  );
}
