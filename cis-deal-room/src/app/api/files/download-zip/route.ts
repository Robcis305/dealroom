import { z } from 'zod';
import archiver from 'archiver';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { verifySession } from '@/lib/dal/index';
import { getFilesForBulkDownload } from '@/lib/dal/files';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { logActivity } from '@/lib/dal/activity';
import { db } from '@/db';

export const runtime = 'nodejs'; // archiver + AWS SDK require Node runtime (not Edge)
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel function max — adjust per plan if needed

const bodySchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Disambiguate filename collisions inside the zip by appending " (2)", " (3)", etc. */
function uniqueName(taken: Set<string>, base: string): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let i = 2;
  while (taken.has(`${stem} (${i})${ext}`)) i++;
  const next = `${stem} (${i})${ext}`;
  taken.add(next);
  return next;
}

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const rows = await getFilesForBulkDownload(body.fileIds);
  if (rows.length === 0) {
    return Response.json({ error: 'No accessible files' }, { status: 404 });
  }

  // All files must belong to the same workspace; otherwise reject (avoids
  // cross-workspace exfiltration via id-stuffing).
  const workspaceIds = new Set(rows.map((r) => r.workspaceId));
  if (workspaceIds.size !== 1) {
    return Response.json(
      { error: 'Files span multiple workspaces' },
      { status: 400 },
    );
  }
  const workspaceId = rows[0].workspaceId;

  const s3 = getS3Client();
  const archive = archiver('zip', { zlib: { level: 6 } });
  const taken = new Set<string>();

  // Stream-pump archive output → Web ReadableStream that Response can consume.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on('end', () => controller.close());
      archive.on('error', (err) => controller.error(err));

      // Kick off the async pipeline that appends each file body to the archive.
      (async () => {
        try {
          for (const row of rows) {
            const obj = await s3.send(
              new GetObjectCommand({ Bucket: S3_BUCKET, Key: row.s3Key }),
            );
            if (!obj.Body) {
              throw new Error(`empty body for ${row.s3Key}`);
            }
            const nodeStream = obj.Body as Readable;
            archive.append(nodeStream, { name: uniqueName(taken, row.name) });
          }
          await archive.finalize();
        } catch (err) {
          archive.destroy(err as Error);
        }
      })();
    },
    cancel() {
      archive.destroy();
    },
  });

  // Activity logging — fire and forget; don't block the response.
  // Log before streaming so the audit trail is recorded even if the client
  // disconnects mid-stream.
  Promise.all(
    rows.map((row) =>
      logActivity(db, {
        workspaceId,
        userId: session.userId,
        action: 'downloaded',
        targetType: 'file',
        targetId: row.id,
        metadata: { bulk: true },
      }),
    ),
  ).catch((err) => {
    console.error('[download-zip] activity log failed:', err);
  });

  const filename = `data-room-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
