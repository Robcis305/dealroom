import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { folders, checklistItems } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getChecklistForWorkspace, createChecklist } from '@/lib/dal/checklist';

const rowSchema = z.object({
  sortOrder: z.number().int(),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  owner: z.enum(['seller', 'buyer', 'both', 'cis_team', 'unassigned']),
  notes: z.string().nullable(),
  requestedAt: z.string().datetime().nullable().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema),
});

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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
  }

  // Reject if a checklist already exists (MVP = one per workspace)
  const existing = await getChecklistForWorkspace(workspaceId);
  if (existing) {
    return Response.json({ error: 'Checklist already exists for this workspace' }, { status: 409 });
  }

  const checklist = await createChecklist(workspaceId);

  // Category → folderId resolution with auto-create
  const categories = Array.from(new Set(parsed.data.rows.map((r) => r.category)));
  const existingFolders = await db
    .select({ id: folders.id, name: folders.name, sortOrder: folders.sortOrder })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceId), inArray(folders.name, categories)));

  const nameToId = new Map(existingFolders.map((f) => [f.name, f.id]));
  const missing = categories.filter((c) => !nameToId.has(c));

  if (missing.length > 0) {
    const maxSort = Math.max(0, ...existingFolders.map((f) => f.sortOrder));
    const inserted = await db
      .insert(folders)
      .values(
        missing.map((name, i) => ({
          workspaceId,
          name,
          sortOrder: maxSort + i + 1,
        })),
      )
      .returning({ id: folders.id, name: folders.name });
    inserted.forEach((f) => nameToId.set(f.name, f.id));
  }

  // Bulk insert items
  const values = parsed.data.rows.map((r) => ({
    checklistId: checklist.id,
    folderId: nameToId.get(r.category)!,
    sortOrder: r.sortOrder,
    category: r.category,
    name: r.name,
    description: r.description,
    priority: r.priority,
    owner: r.owner,
    notes: r.notes,
    requestedAt: r.requestedAt ? new Date(r.requestedAt) : new Date(),
  }));
  await db.insert(checklistItems).values(values);

  return Response.json({ checklistId: checklist.id, itemCount: values.length });
}
