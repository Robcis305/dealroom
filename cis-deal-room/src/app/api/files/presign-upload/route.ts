import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifySession } from '@/lib/dal/index';
import { checkDuplicate } from '@/lib/dal/files';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { requireFolderAccess } from '@/lib/dal/access';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/csv',
  'image/jpeg',
  'image/png',
  'video/mp4',
]);

const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const schema = z.object({
  folderId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  workspaceId: z.string().min(1),
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

  const { folderId, fileName, mimeType, sizeBytes, workspaceId } = parsed;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return Response.json({ error: 'File type not allowed' }, { status: 400 });
  }

  // Validate file size
  if (sizeBytes > MAX_SIZE_BYTES) {
    return Response.json({ error: 'File size exceeds 500 MB limit' }, { status: 400 });
  }

  // IDOR enforcement: confirm caller has upload permission on this folder
  try {
    await requireFolderAccess(folderId, session, 'upload');
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Duplicate detection — let the caller decide whether to version or cancel
  const existing = await checkDuplicate(folderId, fileName);
  if (existing) {
    return Response.json({
      duplicate: true,
      existingFileId: existing.id,
      existingVersion: existing.version,
    });
  }

  // S3 stub — return fake key when bucket is not configured
  if (!S3_BUCKET) {
    const s3Key = `stub/fake-key-${crypto.randomUUID()}`;
    return Response.json({ presignedUrl: null, s3Key, duplicate: false });
  }

  const s3Key = `workspaces/${workspaceId}/folders/${folderId}/${crypto.randomUUID()}-${fileName}`;

  const presignedUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      ServerSideEncryption: 'AES256',
    }),
    { expiresIn: 15 * 60 } // 15 minutes
  );

  return Response.json({ presignedUrl, s3Key, duplicate: false });
}
