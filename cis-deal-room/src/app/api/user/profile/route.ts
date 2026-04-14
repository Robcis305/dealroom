import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';

const profileSchema = z.object({
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof profileSchema>;
  try {
    const body = await request.json();
    const trimmed = {
      firstName: typeof body.firstName === 'string' ? body.firstName.trim() : '',
      lastName: typeof body.lastName === 'string' ? body.lastName.trim() : '',
    };
    parsed = profileSchema.parse(trimmed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.userId))
    .returning();

  return Response.json(updated);
}
