import { z } from 'zod';
import { createFolder } from '@/lib/dal/folders';

const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a Promise
    const { id: workspaceId } = await params;
    const body = await request.json();
    const { name } = createFolderSchema.parse(body);

    const folder = await createFolder(workspaceId, name);
    return Response.json(folder, { status: 201 });
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
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
