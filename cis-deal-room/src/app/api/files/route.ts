import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { db } from '@/db';
import { users, files } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireFolderAccess } from '@/lib/dal/access';

const schema = z.object({ folderId: z.string().uuid() });

export async function GET(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = schema.safeParse({ folderId: url.searchParams.get('folderId') });
  if (!parsed.success) return Response.json({ error: 'folderId required' }, { status: 400 });

  try {
    await requireFolderAccess(parsed.data.folderId, session, 'download');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Fetch files with uploader email via join, newest first
    const rows = await db
      .select({
        id: files.id,
        folderId: files.folderId,
        name: files.name,
        s3Key: files.s3Key,
        sizeBytes: files.sizeBytes,
        mimeType: files.mimeType,
        version: files.version,
        createdAt: files.createdAt,
        uploadedByEmail: users.email,
      })
      .from(files)
      .innerJoin(users, eq(files.uploadedBy, users.id))
      .where(eq(files.folderId, parsed.data.folderId))
      .orderBy(desc(files.createdAt));

    return Response.json(rows);
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
