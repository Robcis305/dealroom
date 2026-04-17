import { eq } from 'drizzle-orm';
import { getWorkspacesForUser } from '@/lib/dal/workspaces';
import { verifySession } from '@/lib/dal';
import { db } from '@/db';
import { users } from '@/db/schema';
import { DealList } from '@/components/deals/DealList';
import { ReturnToHandler } from '@/components/auth/ReturnToHandler';
import { Logo } from '@/components/ui/Logo';
import { UserMenu } from '@/components/ui/UserMenu';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Deals list page — Server Component.
 * Fetches workspaces and session, then passes data to the client DealList.
 */
export default async function DealsPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  const workspaces = await getWorkspacesForUser();

  const [userRow] = await db
    .select({ notificationDigest: users.notificationDigest })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <div className="min-h-screen bg-bg">
      <ReturnToHandler />
      <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
        <Logo size="sm" />
        <span className="text-sm font-semibold text-text-primary flex-1">Deal Rooms</span>
        <UserMenu
          userEmail={session.userEmail}
          notificationDigest={userRow?.notificationDigest ?? false}
        />
      </header>
      <div className="p-6 max-w-6xl mx-auto">
        <DealList workspaces={workspaces} isAdmin={session.isAdmin} />
      </div>
    </div>
  );
}
