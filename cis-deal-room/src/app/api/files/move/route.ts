import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { moveFiles } from '@/lib/dal/files';

const bodySchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1),
  destinationFolderId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const result = await moveFiles({
    fileIds: body.fileIds,
    destinationFolderId: body.destinationFolderId,
  });

  return Response.json(result);
}
