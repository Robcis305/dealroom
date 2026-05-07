import { PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/db';
import { files } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { parseCsv } from '@/lib/cap-table/parse-csv';
import { uploadCapTable } from '@/lib/dal/cap-table';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now();
  const log = (step: string) => console.log(`[cap-table:upload] +${Date.now() - t0}ms ${step}`);

  log('START');

  const session = await verifySession();
  log(`verifySession done (session=${!!session})`);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;
  log(`workspaceId=${workspaceId}`);

  try {
    await requireDealAccess(workspaceId, session);
    log('requireDealAccess ok');
  } catch {
    log('requireDealAccess FAILED');
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  log('about to read formData');
  const formData = await request.formData();
  log('formData parsed');

  const file = formData.get('file');
  if (!(file instanceof File)) {
    log('no file in formData');
    return Response.json({ error: 'No file uploaded' }, { status: 400 });
  }
  log(`file received name=${file.name} size=${file.size}`);
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json(
      { error: `File too large (${file.size} bytes; max ${MAX_SIZE_BYTES})` },
      { status: 400 },
    );
  }

  log('reading file text');
  const text = await file.text();
  log(`text read, length=${text.length}`);

  log('parsing CSV');
  const parsed = parseCsv(text);
  log(`parsed: ${parsed.rows.length} rows, ${parsed.errors.length} errors, ${parsed.warnings.length} warnings`);

  if (parsed.errors.length > 0) {
    return Response.json({ errors: parsed.errors }, { status: 400 });
  }

  // Persist CSV to S3 first; if S3 fails, the whole upload fails before any DB write.
  const s3Key = `cap-tables/${workspaceId}/${Date.now()}-${file.name}`;
  log(`s3 putObject START bucket=${S3_BUCKET} key=${s3Key}`);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: text,
      ContentType: 'text/csv',
    }),
  );
  log('s3 putObject DONE');

  // Create files row (folder_id = null since cap-table CSVs aren't in a folder)
  log('inserting files row');
  const [filesRow] = await db
    .insert(files)
    .values({
      folderId: null,
      uploadedBy: session.userId,
      name: file.name,
      mimeType: 'text/csv',
      sizeBytes: file.size,
      s3Key,
    })
    .returning();
  log(`files row inserted id=${filesRow.id}`);

  log('uploadCapTable DAL START');
  const created = await uploadCapTable({
    workspaceId,
    fileId: filesRow.id,
    rows: parsed.rows,
    warnings: parsed.warnings,
  });
  log(`uploadCapTable DAL DONE id=${created.id}`);

  return Response.json({
    capTable: created,
    warnings: parsed.warnings,
    rowCount: parsed.rows.length,
  }, { status: 201 });
}
