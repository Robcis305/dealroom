import { z } from 'zod';
import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getParticipants, inviteParticipant } from '@/lib/dal/participants';
import { getWorkspace } from '@/lib/dal/workspaces';
import { sendEmail } from '@/lib/email/send';
import { InvitationEmail } from '@/lib/email/invitation';
import { getAppUrl } from '@/lib/app-url';
import { getOutstandingDealKillerGroups, shouldShowCanonicalPlaybook } from '@/lib/dal/playbook';
import { getChecklistForWorkspace } from '@/lib/dal/checklist';
import { logActivity } from '@/lib/dal/activity';
import { db } from '@/db';

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
    'seller_counsel',
    'buyer_counsel',
  ]),
  folderIds: z.array(z.string().uuid()).default([]),
  viewOnlyShadowSide: z.enum(['buyer', 'seller']).nullable().optional(),
  acknowledgement: z.string().optional(),
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

  // Lowercase the email at the route boundary so the invite link, the token
  // row, and the user row all key off the same canonical form.
  const email = parsed.email.toLowerCase();

  // Gate: external-side invites with outstanding deal-killers require acknowledgement.
  // The trigger set flips based on cisAdvisorySide:
  //   seller_side advisory → buyer roles are external (buyer_rep, buyer_counsel, view_only@buyer)
  //   buyer_side advisory  → seller roles are external (seller_rep, seller_counsel, view_only@seller)
  const externalRoles =
    workspace.cisAdvisorySide === 'seller_side'
      ? new Set(['buyer_rep', 'buyer_counsel'])
      : new Set(['seller_rep', 'seller_counsel']);
  const externalShadow =
    workspace.cisAdvisorySide === 'seller_side' ? 'buyer' : 'seller';

  const isExternalInvite =
    externalRoles.has(parsed.role) ||
    (parsed.role === 'view_only' && parsed.viewOnlyShadowSide === externalShadow);

  if (isExternalInvite && shouldShowCanonicalPlaybook(workspace)) {
    const checklist = await getChecklistForWorkspace(workspaceId);
    if (checklist) {
      const outstanding = await getOutstandingDealKillerGroups(checklist.id);
      if (outstanding.length > 0) {
        const ackOk = parsed.acknowledgement?.trim().toLowerCase() === 'share anyway';
        if (!ackOk) {
          return Response.json(
            { error: 'Outstanding deal-killers', outstanding },
            { status: 409 },
          );
        }
        // Acknowledged — log to activity for audit trail.
        await logActivity(db, {
          workspaceId,
          userId: session.userId,
          action: 'buyer_invite_with_outstanding',
          targetType: 'participant',
          metadata: {
            targetEmail: email,
            outstandingGroups: outstanding.map((o) => o.group),
          },
        });
      }
    }
  }

  const { participant, rawToken } = await inviteParticipant({
    workspaceId,
    email,
    role: parsed.role,
    folderIds: parsed.folderIds,
    viewOnlyShadowSide: parsed.viewOnlyShadowSide ?? null,
  });

  const appUrl = getAppUrl();
  const inviteLink = `${appUrl}/api/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;

  // Dev-mode convenience: surface the invite URL in the server log when
  // Resend is stubbed.
  if (!process.env.RESEND_API_KEY) {
    console.log('[auth:invite-link]', email, '→', inviteLink);
  }

  // Resolve role label with contextual Rep naming
  let roleLabel = ROLE_LABELS[parsed.role];
  if (parsed.role === 'seller_rep') roleLabel = 'Seller Rep';
  if (parsed.role === 'buyer_rep') roleLabel = 'Buyer Rep';

  await sendEmail({
    to: email,
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
