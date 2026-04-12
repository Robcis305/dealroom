import { notFound, redirect } from 'next/navigation';
import { getWorkspace } from '@/lib/dal/workspaces';
import { getFoldersForWorkspace } from '@/lib/dal/folders';
import { verifySession } from '@/lib/dal';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

interface WorkspacePageProps {
  params: Promise<{ workspaceId: string }>;
}

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

  const [workspace, folders] = await Promise.all([
    getWorkspace(workspaceId),
    getFoldersForWorkspace(workspaceId),
  ]);

  if (!workspace) {
    notFound();
  }

  return (
    <WorkspaceShell
      workspace={workspace}
      folders={folders}
      isAdmin={session.isAdmin}
    />
  );
}
