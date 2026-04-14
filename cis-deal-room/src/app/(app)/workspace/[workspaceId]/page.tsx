import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getWorkspace } from '@/lib/dal/workspaces';
import { getFoldersForWorkspace } from '@/lib/dal/folders';
import { getFileCountsByFolder } from '@/lib/dal/files';
import { countActiveClientParticipants } from '@/lib/dal/participants';
import { verifySession } from '@/lib/dal';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

interface WorkspacePageProps {
  params: Promise<{ workspaceId: string }>;
}

// Never cache this page — session-aware and data changes frequently
export const dynamic = 'force-dynamic';

/**
 * Workspace page — Server Component.
 * Next.js 15: params is a Promise, must be awaited.
 */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  // Next.js 15 async params
  const { workspaceId } = await params;

  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  const [workspace, folders, activeClientCount, userRows] = await Promise.all([
    getWorkspace(workspaceId),
    getFoldersForWorkspace(workspaceId),
    countActiveClientParticipants(workspaceId),
    db
      .select({ notificationDigest: users.notificationDigest })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
  ]);

  if (!workspace) {
    notFound();
  }

  const fileCounts = await getFileCountsByFolder(folders.map((f) => f.id));

  return (
    <WorkspaceShell
      workspace={workspace}
      folders={folders}
      fileCounts={fileCounts}
      isAdmin={session.isAdmin}
      activeClientCount={activeClientCount}
      notificationDigest={userRows[0]?.notificationDigest ?? false}
      userEmail={session.userEmail}
    />
  );
}
