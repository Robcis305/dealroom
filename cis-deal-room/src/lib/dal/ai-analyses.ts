import { and, eq, isNull, isNotNull, desc, exists, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  aiAnalyses, aiFindings, checklistItemAiAnalyses,
  files, folderAccess, folders, workspaceParticipants,
  checklistItems,
} from '@/db/schema';
import { verifySession } from '@/lib/dal/index';
import { logActivity } from './activity';
import type { AiAnalysisStatus, AiAnalysisTrigger, AiRiskLevel, Session } from '@/types';

// ─── Visibility ──────────────────────────────────────────────────────────────

/**
 * Returns true if the session user is admin or a `cis_team` participant of
 * the workspace. Used to decide whether to filter to published-only.
 */
export async function viewerIsCisOrAdmin(
  session: Session, workspaceId: string,
): Promise<boolean> {
  if (session.isAdmin) return true;
  const [row] = await db
    .select({ id: workspaceParticipants.id })
    .from(workspaceParticipants)
    .where(and(
      eq(workspaceParticipants.workspaceId, workspaceId),
      eq(workspaceParticipants.userId, session.userId),
      eq(workspaceParticipants.status, 'active'),
      eq(workspaceParticipants.role, 'cis_team'),
    ))
    .limit(1);
  return !!row;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

interface EnqueueInput {
  workspaceId: string;
  fileId: string;
  fileVersion: number;
  trigger: AiAnalysisTrigger;
  checklistItemId: string | null;
}

/**
 * Idempotent enqueue. If a non-superseded analysis already exists for
 * (fileId, fileVersion), return it instead of inserting. Returns the
 * analysis row + a flag indicating whether a new row was created.
 */
export async function enqueueAnalysis(input: EnqueueInput): Promise<{
  analysisId: string;
  created: boolean;
}> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: aiAnalyses.id })
      .from(aiAnalyses)
      .where(and(
        eq(aiAnalyses.fileId, input.fileId),
        eq(aiAnalyses.fileVersion, input.fileVersion),
        isNull(aiAnalyses.supersededAt),
      ))
      .limit(1);

    if (existing) {
      // Associate this checklist item with the existing analysis if one was provided.
      if (input.checklistItemId) {
        await tx.insert(checklistItemAiAnalyses)
          .values({ itemId: input.checklistItemId, analysisId: existing.id })
          .onConflictDoNothing();
      }
      return { analysisId: existing.id, created: false };
    }

    const [row] = await tx.insert(aiAnalyses).values({
      workspaceId: input.workspaceId,
      fileId: input.fileId,
      fileVersion: input.fileVersion,
      triggeredBy: session.userId,
      trigger: input.trigger,
      checklistItemId: input.checklistItemId,
      status: 'queued' as AiAnalysisStatus,
    }).returning({ id: aiAnalyses.id });
    if (!row) throw new Error('insert failed');

    if (input.checklistItemId) {
      await tx.insert(checklistItemAiAnalyses)
        .values({ itemId: input.checklistItemId, analysisId: row.id });
    }
    return { analysisId: row.id, created: true };
  });
}

/**
 * Mark the prior current analysis (if any) superseded and insert a new
 * queued analysis. Used by the manual Re-analyze action.
 */
export async function supersedeAndEnqueue(input: EnqueueInput): Promise<string> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [newRow] = await tx.insert(aiAnalyses).values({
      workspaceId: input.workspaceId,
      fileId: input.fileId,
      fileVersion: input.fileVersion,
      triggeredBy: session.userId,
      trigger: input.trigger,
      checklistItemId: input.checklistItemId,
      status: 'queued' as AiAnalysisStatus,
    }).returning({ id: aiAnalyses.id });
    if (!newRow) throw new Error('insert failed');

    await tx.update(aiAnalyses)
      .set({ supersededAt: new Date(), supersededBy: newRow.id, updatedAt: new Date() })
      .where(and(
        eq(aiAnalyses.fileId, input.fileId),
        eq(aiAnalyses.fileVersion, input.fileVersion),
        isNull(aiAnalyses.supersededAt),
        sql`${aiAnalyses.id} != ${newRow.id}`,
      ));

    return newRow.id;
  });
}

// ─── Worker write paths ──────────────────────────────────────────────────────

export async function markRunning(analysisId: string): Promise<void> {
  await db.update(aiAnalyses)
    .set({ status: 'running' as AiAnalysisStatus, updatedAt: new Date() })
    .where(and(eq(aiAnalyses.id, analysisId), eq(aiAnalyses.status, 'queued')));
}

export async function markFailed(
  analysisId: string, errorMessage: string,
): Promise<void> {
  await db.update(aiAnalyses)
    .set({
      status: 'failed' as AiAnalysisStatus,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(aiAnalyses.id, analysisId));
}

interface PersistResultInput {
  analysisId: string;
  riskScore: number;
  summary: string;
  priorityActions: string[];
  modelUsed: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  findings: Array<{
    ordinal: number;
    clauseText: string;
    category: string;
    riskLevel: AiRiskLevel;
    impactSummary: string;
    benchmarkComparison: string;
    recommendation: string;
    flagForReview: boolean;
  }>;
}

export async function persistResult(input: PersistResultInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(aiAnalyses)
      .set({
        status: 'complete' as AiAnalysisStatus,
        riskScore: input.riskScore,
        summary: input.summary,
        priorityActions: input.priorityActions,
        modelUsed: input.modelUsed,
        promptVersion: input.promptVersion,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
        durationMs: input.durationMs,
        updatedAt: new Date(),
      })
      .where(eq(aiAnalyses.id, input.analysisId));
    if (input.findings.length > 0) {
      await tx.insert(aiFindings).values(input.findings.map(f => ({
        analysisId: input.analysisId,
        ordinal: f.ordinal,
        clauseText: f.clauseText,
        category: f.category,
        riskLevel: f.riskLevel,
        impactSummary: f.impactSummary,
        benchmarkComparison: f.benchmarkComparison,
        recommendation: f.recommendation,
        flagForReview: f.flagForReview,
      })));
    }
  });
}

// ─── Publish / unpublish ─────────────────────────────────────────────────────

/**
 * Publish an analysis. Caller is responsible for verifying the session is
 * CIS-team or admin (the route layer does this via viewerIsCisOrAdmin).
 * Returns the row's workspaceId + fileId for the caller's notification fan-out.
 */
export async function publishAnalysis(analysisId: string): Promise<{
  workspaceId: string; fileId: string;
}> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ workspaceId: aiAnalyses.workspaceId, fileId: aiAnalyses.fileId })
      .from(aiAnalyses).where(eq(aiAnalyses.id, analysisId)).limit(1);
    if (!row) throw new Error('Analysis not found');

    await tx.update(aiAnalyses)
      .set({
        publishedAt: new Date(),
        publishedBy: session.userId,
        updatedAt: new Date(),
      })
      .where(eq(aiAnalyses.id, analysisId));
    return row;
  });
}

export async function unpublishAnalysis(analysisId: string): Promise<{
  workspaceId: string; fileId: string;
}> {
  const session = await verifySession();
  if (!session) throw new Error('Unauthorized');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ workspaceId: aiAnalyses.workspaceId, fileId: aiAnalyses.fileId })
      .from(aiAnalyses).where(eq(aiAnalyses.id, analysisId)).limit(1);
    if (!row) throw new Error('Analysis not found');

    await tx.update(aiAnalyses)
      .set({ publishedAt: null, publishedBy: null, updatedAt: new Date() })
      .where(eq(aiAnalyses.id, analysisId));
    return row;
  });
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * Returns the *current* analysis (non-superseded) for a file, filtered by viewer
 * visibility. Returns null if none exists or the viewer can't see it.
 */
export async function getCurrentAnalysisForFile(
  fileId: string, session: Session,
): Promise<typeof aiAnalyses.$inferSelect | null> {
  const [file] = await db.select({ folderId: files.folderId, workspaceId: folders.workspaceId })
    .from(files)
    .leftJoin(folders, eq(folders.id, files.folderId))
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file || !file.workspaceId) return null;

  const cis = await viewerIsCisOrAdmin(session, file.workspaceId);

  const baseConds = [
    eq(aiAnalyses.fileId, fileId),
    isNull(aiAnalyses.supersededAt),
  ];
  if (!cis) {
    baseConds.push(isNotNull(aiAnalyses.publishedAt));
    if (file.folderId) {
      baseConds.push(exists(
        db.select({ x: sql`1` })
          .from(folderAccess)
          .innerJoin(workspaceParticipants,
            eq(workspaceParticipants.id, folderAccess.participantId))
          .where(and(
            eq(folderAccess.folderId, file.folderId),
            eq(workspaceParticipants.userId, session.userId),
            eq(workspaceParticipants.status, 'active'),
          )),
      ));
    } else {
      // No folder = no access path for non-CIS.
      return null;
    }
  }

  const [row] = await db.select().from(aiAnalyses).where(and(...baseConds)).limit(1);
  return row ?? null;
}

export async function getFindingsForAnalysis(analysisId: string) {
  return db.select().from(aiFindings)
    .where(eq(aiFindings.analysisId, analysisId))
    .orderBy(aiFindings.ordinal);
}

/**
 * For the FileList: given a list of fileIds, returns a map of fileId →
 * a small "AI badge" payload (status + counts + risk + published flag),
 * filtered by visibility. CIS sees draft+published; others published only.
 *
 * NOTE: Uses inArray() instead of ANY(${fileIds}) for compatibility with
 * this version of drizzle-orm.
 */
export async function getAiBadgesForFiles(
  fileIds: string[], session: Session, workspaceId: string,
): Promise<Record<string, {
  analysisId: string;
  status: AiAnalysisStatus;
  riskScore: number | null;
  findingCount: number;
  published: boolean;
}>> {
  if (fileIds.length === 0) return {};
  const cis = await viewerIsCisOrAdmin(session, workspaceId);
  const conds = [
    inArray(aiAnalyses.fileId, fileIds),
    isNull(aiAnalyses.supersededAt),
  ];
  if (!cis) conds.push(isNotNull(aiAnalyses.publishedAt));

  const rows = await db
    .select({
      id: aiAnalyses.id,
      fileId: aiAnalyses.fileId,
      status: aiAnalyses.status,
      riskScore: aiAnalyses.riskScore,
      publishedAt: aiAnalyses.publishedAt,
      findingCount: sql<number>`(select count(*)::int from ${aiFindings} where ${aiFindings.analysisId} = ${aiAnalyses.id})`,
    })
    .from(aiAnalyses)
    .where(and(...conds));

  const out: Record<string, {
    analysisId: string; status: AiAnalysisStatus;
    riskScore: number | null; findingCount: number; published: boolean;
  }> = {};
  for (const r of rows) {
    out[r.fileId] = {
      analysisId: r.id,
      status: r.status,
      riskScore: r.riskScore,
      findingCount: Number(r.findingCount),
      published: !!r.publishedAt,
    };
  }
  return out;
}
