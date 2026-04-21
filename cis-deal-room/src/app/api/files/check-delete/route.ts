import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { getChecklistLocksForFiles } from '@/lib/dal/files';

const schema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const locks = await getChecklistLocksForFiles(parsed.data.fileIds);
  return Response.json({ locks });
}
