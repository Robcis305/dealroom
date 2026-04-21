import { eq, asc } from 'drizzle-orm';
import { db } from '@/db';
import { folders } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { parseChecklistXlsx } from '@/lib/checklist/parse-xlsx';
import { resolveFolderMatches } from '@/lib/checklist/folder-match';

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
  const parse = parseChecklistXlsx(buf);

  // Resolve each distinct category against existing folders so the admin can
  // review + override the mapping before committing the import.
  const categories = Array.from(new Set(parse.valid.map((r) => r.category)));
  const existingFolders = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .orderBy(asc(folders.sortOrder));

  const folderResolution = resolveFolderMatches(categories, existingFolders);

  return Response.json({
    ...parse,
    folderResolution,
    existingFolders,
  });
}
