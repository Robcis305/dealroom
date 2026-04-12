import { z } from 'zod';
import { renameFolder, deleteFolder } from '@/lib/dal/folders';

const renameFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a Promise
    const { id } = await params;
    const body = await request.json();
    const { name } = renameFolderSchema.parse(body);

    const folder = await renameFolder(id, name);
    return Response.json(folder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Admin required') {
        return Response.json({ error: 'Admin required' }, { status: 403 });
      }
      if (error.message === 'Folder not found') {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a Promise
    const { id } = await params;
    await deleteFolder(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Admin required') {
        return Response.json({ error: 'Admin required' }, { status: 403 });
      }
      if (error.message === 'Folder not found') {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
      }
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
