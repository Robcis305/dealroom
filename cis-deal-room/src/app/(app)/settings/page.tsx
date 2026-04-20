import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/index';
import { db } from '@/db';
import { users } from '@/db/schema';
import { Logo } from '@/components/ui/Logo';
import { NotificationPreferencesForm } from '@/components/settings/NotificationPreferencesForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const [row] = await db
    .select({
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return (
    <div className="min-h-screen bg-bg">
      <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
        <Logo size="sm" />
        <span className="text-sm font-semibold text-text-primary flex-1">Settings</span>
      </header>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-text-primary mb-4">Notification preferences</h1>
        <NotificationPreferencesForm
          initialNotifyUploads={row?.notifyUploads ?? true}
          initialNotifyDigest={row?.notifyDigest ?? false}
        />
      </div>
    </div>
  );
}
