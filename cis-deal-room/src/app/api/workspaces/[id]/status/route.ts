import { z } from 'zod';
import { updateWorkspaceStatus } from '@/lib/dal/workspaces';
import type { WorkspaceStatus } from '@/types';

const patchStatusSchema = z.object({
  status: z.enum([
    'engagement',
    'active_dd',
    'ioi_stage',
    'closing',
    'closed',
    'archived',
  ]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a Promise
    const { id } = await params;
    const body = await request.json();
    const { status } = patchStatusSchema.parse(body);

    const workspace = await updateWorkspaceStatus(id, status as WorkspaceStatus);
    return Response.json(workspace);
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
