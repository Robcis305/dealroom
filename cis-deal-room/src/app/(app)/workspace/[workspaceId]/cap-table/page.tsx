import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/index';
import { CapTablePage } from '@/components/workspace/CapTablePage';

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await verifySession();
  if (!session) redirect('/auth/login');

  const { workspaceId } = await params;

  return <CapTablePage workspaceId={workspaceId} isAdmin={session.isAdmin} />;
}
