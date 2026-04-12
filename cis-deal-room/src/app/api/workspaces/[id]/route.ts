import { getWorkspace } from '@/lib/dal/workspaces';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a Promise
    const { id } = await params;
    const workspace = await getWorkspace(id);

    if (!workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return Response.json(workspace);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
