import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { mergeFolders } from '@/lib/dal/folders';

const schema = z.object({
  targetFolderId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; folderId: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId, folderId: sourceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const result = await mergeFolders(sourceId, parsed.data.targetFolderId);
    return Response.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'Source folder not found' || e.message === 'Target folder not found') {
        return Response.json({ error: e.message }, { status: 404 });
      }
      if (e.message === 'Source and target must differ' || e.message === 'Cross-workspace merge not allowed') {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }
    throw e;
  }
}
