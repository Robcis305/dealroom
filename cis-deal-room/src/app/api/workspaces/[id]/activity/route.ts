import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { activityLogs, users } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query parameters' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      targetType: activityLogs.targetType,
      targetId: activityLogs.targetId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      actorEmail: users.email,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
    })
    .from(activityLogs)
    .innerJoin(users, eq(users.id, activityLogs.userId))
    .where(
      and(
        eq(activityLogs.workspaceId, workspaceId),
        ne(activityLogs.action, 'previewed')
      )
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(parsed.data.limit)
    .offset(parsed.data.offset);

  return Response.json(rows);
}
