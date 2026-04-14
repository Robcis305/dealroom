import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  workspaceParticipants,
  folderAccess,
  magicLinkTokens,
} from '@/db/schema';
import { verifySession } from './index';
import { logActivity } from './activity';
import { generateToken, hashToken } from '@/lib/auth/tokens';
import type { ParticipantRole } from './permissions';

const INVITATION_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface InviteInput {
  workspaceId: string;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
}

interface UpdateInput {
  role: ParticipantRole;
  folderIds: string[];
}

/**
 * Returns all participants for a workspace joined with user email.
 * Any authenticated user with deal access can call this (caller must
 * verify dealAccess separately).
 */
export async function getParticipants(workspaceId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: workspaceParticipants.id,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
      status: workspaceParticipants.status,
      invitedAt: workspaceParticipants.invitedAt,
      activatedAt: workspaceParticipants.activatedAt,
      folderIds: sql<string[]>`coalesce(array_agg(${folderAccess.folderId}) filter (where ${folderAccess.folderId} is not null), '{}')`,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .leftJoin(folderAccess, eq(folderAccess.participantId, workspaceParticipants.id))
    .where(eq(workspaceParticipants.workspaceId, workspaceId))
    .groupBy(
      workspaceParticipants.id,
      workspaceParticipants.userId,
      users.email,
      workspaceParticipants.role,
      workspaceParticipants.status,
      workspaceParticipants.invitedAt,
      workspaceParticipants.activatedAt,
    );

  return rows;
}

/**
 * Creates or looks up the user by email, inserts a participant row
 * (status: 'invited'), inserts folder_access rows, creates an invitation
 * token valid for 3 days, and logs the activity. Returns the participant
 * row and the raw invitation token (caller is responsible for emailing it).
 *
 * If the user already has a participant row for this workspace with
 * status 'invited', refreshes the token instead of inserting a duplicate.
 */
export async function inviteParticipant(input: InviteInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
  const redirectTo = `/workspace/${input.workspaceId}`;

  const result = await db.transaction(async (tx) => {
    // 1. Find-or-create user by email
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    const userId = existingUser
      ? existingUser.id
      : (await tx
          .insert(users)
          .values({ email: input.email, isAdmin: false })
          .returning({ id: users.id }))[0].id;

    // 2. Find-or-create participant row for this workspace
    const [existingParticipant] = await tx
      .select()
      .from(workspaceParticipants)
      .where(
        and(
          eq(workspaceParticipants.workspaceId, input.workspaceId),
          eq(workspaceParticipants.userId, userId)
        )
      )
      .limit(1);

    // Fix #1: Re-invite must update the role on the existing participant row
    if (existingParticipant) {
      if (existingParticipant.role !== input.role) {
        await tx
          .update(workspaceParticipants)
          .set({ role: input.role })
          .where(eq(workspaceParticipants.id, existingParticipant.id));
      }
    }

    const participant = existingParticipant
      ? { ...existingParticipant, role: input.role }
      : (await tx
          .insert(workspaceParticipants)
          .values({
            workspaceId: input.workspaceId,
            userId,
            role: input.role,
            status: 'invited',
          })
          .returning())[0];

    // 3. Insert folder_access rows (delete existing first if re-invite)
    await tx
      .delete(folderAccess)
      .where(eq(folderAccess.participantId, participant.id));

    if (input.folderIds.length > 0) {
      await tx.insert(folderAccess).values(
        input.folderIds.map((folderId) => ({
          folderId,
          participantId: participant.id,
        }))
      );
    }

    // 4. Create invitation token (delete any existing invitation tokens for this email)
    // Fix #2: Scope delete to only 'invitation' purpose tokens, not login tokens
    await tx
      .delete(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.email, input.email),
          eq(magicLinkTokens.purpose, 'invitation')
        )
      );
    await tx.insert(magicLinkTokens).values({
      email: input.email,
      tokenHash,
      expiresAt,
      purpose: 'invitation',
      redirectTo,
    });

    return participant;
  });

  await logActivity(db, {
    workspaceId: input.workspaceId,
    userId: session.userId,
    action: 'invited',
    targetType: 'participant',
    targetId: result.id,
    metadata: { email: input.email, role: input.role, folderIds: input.folderIds },
  });

  return { participant: result, rawToken };
}

/**
 * Updates a participant's role and/or folder access atomically.
 * Admin-only. Admins cannot demote their own role.
 */
export async function updateParticipant(participantId: string, input: UpdateInput) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: workspaceParticipants.id,
      workspaceId: workspaceParticipants.workspaceId,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);

  if (!existing) throw new Error('Participant not found');

  // Self-guard: an admin cannot demote their own role away from 'admin'
  if (existing.userId === session.userId && input.role !== 'admin' && existing.role === 'admin') {
    throw new Error('Cannot demote self');
  }

  // Fix #3: Read beforeFolderAccessRows inside the transaction to avoid TOCTOU race
  let beforeFolderAccessRows: { folderId: string }[] = [];

  await db.transaction(async (tx) => {
    beforeFolderAccessRows = await tx
      .select({ folderId: folderAccess.folderId })
      .from(folderAccess)
      .where(eq(folderAccess.participantId, participantId));

    await tx
      .update(workspaceParticipants)
      .set({ role: input.role })
      .where(eq(workspaceParticipants.id, participantId));

    await tx.delete(folderAccess).where(eq(folderAccess.participantId, participantId));

    if (input.folderIds.length > 0) {
      await tx.insert(folderAccess).values(
        input.folderIds.map((folderId) => ({
          folderId,
          participantId,
        }))
      );
    }
  });

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'participant_updated',
    targetType: 'participant',
    targetId: participantId,
    metadata: {
      beforeRole: existing.role,
      afterRole: input.role,
      beforeFolderIds: beforeFolderAccessRows.map((r) => r.folderId),
      afterFolderIds: input.folderIds,
    },
  });
}

/**
 * Returns the number of active Client participants in a workspace.
 * Used to guard the Engagement → Active DD status transition.
 */
export async function countActiveClientParticipants(workspaceId: string): Promise<number> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  const [row] = await db
    .select({ count: count() })
    .from(workspaceParticipants)
    .where(
      and(
        eq(workspaceParticipants.workspaceId, workspaceId),
        eq(workspaceParticipants.role, 'client'),
        eq(workspaceParticipants.status, 'active')
      )
    );

  return Number(row?.count ?? 0);
}

/**
 * Removes a participant from a workspace. Admin-only.
 * Admins cannot remove themselves.
 * folder_access rows cascade-delete via FK.
 */
export async function removeParticipant(participantId: string) {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Admin required');

  const [existing] = await db
    .select({
      id: workspaceParticipants.id,
      workspaceId: workspaceParticipants.workspaceId,
      userId: workspaceParticipants.userId,
      email: users.email,
      role: workspaceParticipants.role,
    })
    .from(workspaceParticipants)
    .innerJoin(users, eq(users.id, workspaceParticipants.userId))
    .where(eq(workspaceParticipants.id, participantId))
    .limit(1);

  if (!existing) throw new Error('Participant not found');
  if (existing.userId === session.userId) throw new Error('Cannot remove self');

  await db
    .delete(workspaceParticipants)
    .where(eq(workspaceParticipants.id, participantId));

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    userId: session.userId,
    action: 'removed',
    targetType: 'participant',
    targetId: participantId,
    metadata: { email: existing.email, role: existing.role },
  });
}
