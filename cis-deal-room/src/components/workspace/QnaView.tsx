'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { QnaList } from './QnaList';
import { QnaDetail } from './QnaDetail';
import { AskQuestionModal } from './AskQuestionModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Folder {
  id: string;
  name: string;
}

interface Participant {
  id: string;
  name: string;
}

// Shape returned by GET /api/workspaces/:id/participants (bare array)
interface ParticipantRow {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

type InternalView =
  | { kind: 'list' }
  | { kind: 'detail'; id: string };

interface Props {
  workspaceId: string;
  canManage: boolean;
  currentUserId: string;
  folders: Folder[];
  onCountsChanged?: () => void;
  /** Deep-link from a notification email: open straight to this question's detail. */
  initialQuestionId?: string | null;
}

// ─── QnaView ──────────────────────────────────────────────────────────────────

export function QnaView({
  workspaceId,
  canManage,
  currentUserId,
  folders,
  onCountsChanged,
  initialQuestionId = null,
}: Props) {
  const [view, setView] = useState<InternalView>(
    initialQuestionId ? { kind: 'detail', id: initialQuestionId } : { kind: 'list' },
  );
  const [showAsk, setShowAsk] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Fetch participants once — used by QnaDetail composer for @mentions
  const loadParticipants = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`);
      if (!res.ok) return;
      const data: ParticipantRow[] = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setParticipants(
        rows.map((p) => ({
          // Use userId as the identity so @mentions are user-scoped
          id: p.userId,
          name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email,
        })),
      );
    } catch {
      // silently ignore — composer works without @mention list
    }
  }, [workspaceId]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  return (
    <div className="p-6">
      {view.kind === 'list' ? (
        <QnaList
          workspaceId={workspaceId}
          onOpenQuestion={(id) => setView({ kind: 'detail', id })}
          onAsk={() => setShowAsk(true)}
        />
      ) : (
        <QnaDetail
          workspaceId={workspaceId}
          questionId={view.id}
          canManage={canManage}
          currentUserId={currentUserId}
          participants={participants}
          onBack={() => setView({ kind: 'list' })}
          onChanged={() => onCountsChanged?.()}
        />
      )}

      {showAsk && (
        <AskQuestionModal
          workspaceId={workspaceId}
          folders={folders}
          onClose={() => setShowAsk(false)}
          onCreated={(newId) => {
            setShowAsk(false);
            setView({ kind: 'detail', id: newId });
            onCountsChanged?.();
          }}
        />
      )}
    </div>
  );
}
