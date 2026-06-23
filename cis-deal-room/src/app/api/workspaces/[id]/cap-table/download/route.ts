import { and, eq } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@/db';
import { files, workspaceParticipants, workspaces } from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import {
  applyCapTableVisibilityGate,
  getCapTableForWorkspace,
} from '@/lib/dal/cap-table';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import type { ParticipantRole } from '@/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ct = await getCapTableForWorkspace(workspaceId);
  if (!ct) return Response.json({ error: 'No cap table' }, { status: 404 });

  // Visibility gate (same as GET /cap-table)
  let role: ParticipantRole = 'admin';
  if (!session.isAdmin) {
    const [participant] = await db
      .select({
        role: workspaceParticipants.role,
      })
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, workspaceId),
          eq(workspaceParticipants.userId, session.userId),
          eq(workspaceParticipants.status, 'active'),
        ),
      )
      .limit(1);
    if (!participant) return Response.json({ error: 'Forbidden' }, { status: 403 });
    role = participant.role;
  }

  const [workspace] = await db
    .select({ cisAdvisorySide: workspaces.cisAdvisorySide })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const gate = applyCapTableVisibilityGate(
    { id: ct.id, status: ct.status },
    {
      isAdmin: session.isAdmin,
      role,
      cisAdvisorySide: workspace.cisAdvisorySide,
    },
  );

  if (!gate.visible) {
    return Response.json({ error: 'Cap table not yet published' }, { status: 403 });
  }

  // Look up the file row for the s3 key
  const [filesRow] = await db
    .select({ s3Key: files.s3Key, name: files.name })
    .from(files)
    .where(eq(files.id, ct.fileId))
    .limit(1);
  if (!filesRow) return Response.json({ error: 'File not found' }, { status: 404 });

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: filesRow.s3Key,
      ResponseContentDisposition: `attachment; filename="${filesRow.name}"`,
    }),
    { expiresIn: 5 * 60 },
  );

  return Response.json({ url });
}
