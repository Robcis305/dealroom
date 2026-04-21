import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { parseChecklistXlsx } from '@/lib/checklist/parse-xlsx';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;
  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
  }

  const buf = await file.arrayBuffer();
  const result = parseChecklistXlsx(buf);
  return Response.json(result);
}
