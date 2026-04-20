import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const prefsSchema = z.object({
  notifyUploads: z.boolean().optional(),
  notifyDigest: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof prefsSchema>;
  try {
    parsed = prefsSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.notifyUploads !== undefined) patch.notifyUploads = parsed.notifyUploads;
  if (parsed.notifyDigest !== undefined) patch.notifyDigest = parsed.notifyDigest;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, session.userId))
    .returning({
      id: users.id,
      notifyUploads: users.notifyUploads,
      notifyDigest: users.notifyDigest,
    });

  return Response.json(updated);
}
