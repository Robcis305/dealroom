import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { workspaceParticipants } from '@/db/schema';
import { getWorkspace } from '@/lib/dal/workspaces';
import { getFoldersForWorkspace } from '@/lib/dal/folders';
import { getFileCountsByFolder } from '@/lib/dal/files';
import { countActiveClientParticipants } from '@/lib/dal/participants';
import { verifySession } from '@/lib/dal';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import type { ParticipantRole } from '@/types';

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

  const [workspace, folders, activeClientCount] = await Promise.all([
    getWorkspace(workspaceId),
    getFoldersForWorkspace(workspaceId),
    countActiveClientParticipants(workspaceId),
  ]);

  if (!workspace) {
    notFound();
  }

  const fileCounts = await getFileCountsByFolder(folders.map((f) => f.id));

  // Resolve participant role for the current user.
  // Admins don't have a participant row — use 'admin' as the role.
  let participantRole: ParticipantRole = 'admin';
  let participant: { role: ParticipantRole } | undefined;
  if (!session.isAdmin) {
    const [found] = await db
      .select({ role: workspaceParticipants.role })
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, workspaceId),
          eq(workspaceParticipants.userId, session.userId),
          eq(workspaceParticipants.status, 'active'),
        ),
      )
      .limit(1);
    if (found) {
      participant = found;
      participantRole = found.role;
    }
  }

  const canManageWorkstreams =
    session.isAdmin ||
    (participant != null &&
      (participant.role === 'cis_team' || participant.role === 'admin'));

  return (
    <WorkspaceShell
      workspace={workspace}
      folders={folders}
      fileCounts={fileCounts}
      isAdmin={session.isAdmin}
      activeClientCount={activeClientCount}
      userEmail={session.userEmail}
      userId={session.userId}
      participantRole={participantRole}
      canManageWorkstreams={canManageWorkstreams}
    />
  );
}
