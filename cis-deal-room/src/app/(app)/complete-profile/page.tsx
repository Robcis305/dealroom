import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Logo } from '@/components/ui/Logo';
import { ProfileForm } from './ProfileForm';

export default async function CompleteProfilePage() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const [user] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (user?.firstName && user?.lastName) {
    redirect('/deals');
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo size="md" className="mx-auto mb-8" inverse />
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary mb-1">Complete your profile</h1>
          <p className="text-sm text-text-muted mb-6">
            Tell us how you&apos;d like to be identified in the deal room.
          </p>
          <ProfileForm />
        </div>
      </div>
    </main>
  );
}
