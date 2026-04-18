import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { assertFolderInWorkspace } from '@/lib/dal/assertions';
import { renameFolder, deleteFolder } from '@/lib/dal/folders';

const renameSchema = z.object({ name: z.string().min(1) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; folderId: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId, folderId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertFolderInWorkspace(folderId, workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Forbidden';
    return Response.json(
      { error: msg },
      { status: msg === 'Not found' ? 404 : 403 }
    );
  }

  let parsed: z.infer<typeof renameSchema>;
  try {
    parsed = renameSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const folder = await renameFolder(folderId, parsed.name);
    return Response.json(folder);
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Internal error';
    if (m === 'Admin required') return Response.json({ error: m }, { status: 403 });
    if (m === 'Folder not found') return Response.json({ error: m }, { status: 404 });
    return Response.json({ error: m }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; folderId: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId, folderId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertFolderInWorkspace(folderId, workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Forbidden';
    return Response.json(
      { error: msg },
      { status: msg === 'Not found' ? 404 : 403 }
    );
  }

  try {
    await deleteFolder(folderId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Internal error';
    if (m === 'Admin required') return Response.json({ error: m }, { status: 403 });
    if (m === 'Folder not found') return Response.json({ error: m }, { status: 404 });
    return Response.json({ error: m }, { status: 500 });
  }
}
