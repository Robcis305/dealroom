import { z } from 'zod';
import { getWorkspacesForUser, createWorkspace } from '@/lib/dal/workspaces';
import type { WorkspaceStatus, CisAdvisorySide } from '@/types';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Deal codename is required'),
  clientName: z.string().min(1, 'Client name is required'),
  cisAdvisorySide: z.enum(['buyer_side', 'seller_side']),
  status: z.enum([
    'engagement',
    'active_dd',
    'ioi_stage',
    'closing',
    'closed',
    'archived',
  ]),
});

export async function GET() {
  try {
    const workspaceList = await getWorkspacesForUser();
    return Response.json(workspaceList);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createWorkspaceSchema.parse(body);

    const workspace = await createWorkspace({
      name: parsed.name,
      clientName: parsed.clientName,
      cisAdvisorySide: parsed.cisAdvisorySide as CisAdvisorySide,
      status: parsed.status as WorkspaceStatus,
    });

    return Response.json(workspace, { status: 201 });
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
    console.error('[workspaces:POST] unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
