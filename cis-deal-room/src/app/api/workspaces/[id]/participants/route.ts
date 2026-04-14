import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getParticipants, inviteParticipant } from '@/lib/dal/participants';
import { getWorkspace } from '@/lib/dal/workspaces';
import { sendEmail } from '@/lib/email/send';
import { InvitationEmail } from '@/lib/email/invitation';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    'admin',
    'cis_team',
    'client',
    'counsel',
    'buyer_rep',
    'seller_rep',
    'view_only',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
});

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  cis_team: 'CIS Team',
  client: 'Client',
  counsel: 'Counsel',
  buyer_rep: 'Buyer Rep',
  seller_rep: 'Seller Rep',
  view_only: 'View Only',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: workspaceId } = await params;

  try {
    await requireDealAccess(workspaceId, session);
  } catch {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await getParticipants(workspaceId);
  return Response.json(rows);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: 'Admin required' }, { status: 403 });

  const { id: workspaceId } = await params;

  let parsed: z.infer<typeof inviteSchema>;
  try {
    parsed = inviteSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });

  const { participant, rawToken } = await inviteParticipant({
    workspaceId,
    email: parsed.email,
    role: parsed.role,
    folderIds: parsed.folderIds,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const inviteLink = `${appUrl}/auth/verify?token=${rawToken}&email=${encodeURIComponent(parsed.email)}`;

  // Dev-mode convenience: surface the invite URL in the server log when
  // Resend is stubbed.
  if (!process.env.RESEND_API_KEY) {
    console.log('[auth:invite-link]', parsed.email, '→', inviteLink);
  }

  // Resolve role label with contextual Rep naming
  let roleLabel = ROLE_LABELS[parsed.role];
  if (parsed.role === 'seller_rep') roleLabel = 'Seller Rep';
  if (parsed.role === 'buyer_rep') roleLabel = 'Buyer Rep';

  await sendEmail({
    to: parsed.email,
    subject: `You're invited to ${workspace.name} on CIS Deal Room`,
    react: InvitationEmail({
      inviteLink,
      workspaceName: workspace.name,
      roleLabel,
      inviterEmail: session.userEmail,
    }),
  });

  return Response.json(participant, { status: 201 });
}
