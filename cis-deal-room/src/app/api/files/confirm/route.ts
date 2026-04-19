import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { createFile, checkDuplicate } from '@/lib/dal/files';
import { requireFolderAccess } from '@/lib/dal/access';
import { verifyUploadToken } from '@/lib/auth/upload-token';

const schema = z.object({
  uploadToken: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
  // true when the user acknowledged the duplicate warning and chose to version
  confirmedVersioning: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const token = verifyUploadToken(parsed.uploadToken);
  if (!token) {
    return Response.json({ error: 'Invalid or expired upload token' }, { status: 400 });
  }
  if (token.userId !== session.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { s3Key, folderId, workspaceId } = token;
  const { fileName, sizeBytes, mimeType, confirmedVersioning } = parsed;

  // Belt-and-suspenders: confirm the session still has upload permission on the
  // token's folder. The token was bound to the user at presign time, but
  // permissions may have changed in the interim.
  try {
    await requireFolderAccess(folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve previous version when the user chose to create a new version
  let previousVersion: number | undefined;
  if (confirmedVersioning) {
    const existing = await checkDuplicate(folderId, fileName);
    previousVersion = existing?.version;
  }

  const file = await createFile({
    folderId,
    name: fileName,
    s3Key,
    sizeBytes,
    mimeType,
    workspaceId,
    previousVersion,
  });

  return Response.json(file, { status: 201 });
}
