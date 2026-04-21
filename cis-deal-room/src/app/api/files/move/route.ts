import { verifySession } from '@/lib/dal/index';

/**
 * STUB — not yet implemented.
 *
 * When built, this endpoint should:
 *   1. Verify the session.
 *   2. Verify the user has move permission on EVERY file in `fileIds`
 *      (via requireFileAccess or equivalent DAL helper).
 *   3. Verify the user has upload permission on `destinationFolderId`.
 *   4. Update files.folderId = destinationFolderId for each id in one transaction.
 *   5. Emit an activity log entry per moved file.
 *   6. Return { moved: string[], failed: Array<{ id: string, reason: string }> }.
 *
 * Request body: { fileIds: string[], destinationFolderId: string }
 */
export async function POST() {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  return Response.json(
    {
      error: 'Not implemented',
      note: 'File-move endpoint is stubbed. UI is ready; wire this up to enable the feature.',
    },
    { status: 501 }
  );
}
