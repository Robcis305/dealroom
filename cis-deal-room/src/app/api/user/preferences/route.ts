import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const prefsSchema = z.object({
  notificationDigest: z.boolean(),
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

  const [updated] = await db
    .update(users)
    .set({ notificationDigest: parsed.notificationDigest, updatedAt: new Date() })
    .where(eq(users.id, session.userId))
    .returning();

  return Response.json(updated);
}
