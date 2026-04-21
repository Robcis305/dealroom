import { verifySession } from '@/lib/dal/index';

/**
 * STUB — not yet implemented.
 *
 * When built, this endpoint should:
 *   1. Verify the session.
 *   2. Verify the user has download permission on EVERY file in `fileIds`.
 *   3. Stream a ZIP to the client with each file read from S3, OR
 *      generate a short-lived presigned URL to a pre-built zip in S3.
 *   4. Emit activity log entries for each file (bulk-download audit trail).
 *
 * Request body: { fileIds: string[] }
 * Response:     streamed application/zip, OR { url: string }
 */
export async function POST() {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  return Response.json(
    {
      error: 'Not implemented',
      note: 'Bulk-download endpoint is stubbed. UI is ready; wire this up to enable the feature.',
    },
    { status: 501 }
  );
}
