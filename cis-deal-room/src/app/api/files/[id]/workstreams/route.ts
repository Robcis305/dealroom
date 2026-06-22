import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getFileWorkstreamIds, setFileWorkstreams } from '@/lib/dal/workstreams';

/** Resolve the workspaceId that owns a file (via its folder). */
async function workspaceIdForFile(fileId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: folders.workspaceId })
    .from(files)
    .innerJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);
  return row?.workspaceId ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: fileId } = await params;
  const workspaceId = await workspaceIdForFile(fileId);
  if (!workspaceId) return Response.json({ error: 'Not found' }, { status: 404 });
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  return Response.json({ workstreamIds: await getFileWorkstreamIds(fileId) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });
  const { id: fileId } = await params;
  const workspaceId = await workspaceIdForFile(fileId);
  if (!workspaceId) return Response.json({ error: 'Not found' }, { status: 404 });
  try { await requireDealAccess(workspaceId, session); } catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
  let putBody: Record<string, unknown>;
  try { putBody = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { workstreamIds } = putBody;
  if (!Array.isArray(workstreamIds)) return Response.json({ error: 'workstreamIds must be an array' }, { status: 400 });
  await setFileWorkstreams(workspaceId, fileId, workstreamIds);
  return Response.json({ ok: true });
}
