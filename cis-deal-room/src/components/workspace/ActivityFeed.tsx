'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { ActivityRow } from './ActivityRow';

interface ActivityEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorEmail: string;
  actorFirstName: string | null;
  actorLastName: string | null;
}

interface ActivityFeedProps {
  workspaceId: string;
  onTargetClick?: (targetType: string, targetId: string | null) => void;
}

const POLL_MS = 60 * 1000;
const GROUP_WINDOW_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;

interface GroupedEvent extends ActivityEvent {
  count?: number;
}

function groupEvents(events: ActivityEvent[]): GroupedEvent[] {
  const out: GroupedEvent[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.actorEmail === e.actorEmail &&
      prev.action === e.action &&
      prev.targetType === e.targetType &&
      Math.abs(new Date(prev.createdAt).getTime() - new Date(e.createdAt).getTime()) < GROUP_WINDOW_MS
    ) {
      prev.count = (prev.count ?? 1) + 1;
    } else {
      out.push({ ...e });
    }
  }
  return out;
}

export function ActivityFeed({ workspaceId, onTargetClick }: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);

  const loadPage = useCallback(async (offset: number, reset: boolean) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/activity?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) return;
    const data: ActivityEvent[] = await res.json();
    setEvents((prev) => (reset ? data : [...prev, ...data]));
    setHasMore(data.length === PAGE_SIZE);
    offsetRef.current = offset + data.length;
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    loadPage(0, true).finally(() => setLoading(false));
  }, [loadPage]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      timer = setInterval(() => {
        loadPage(0, true);
      }, POLL_MS);
    }
    function stopPolling() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    }
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadPage]);

  async function loadMore() {
    setLoadingMore(true);
    await loadPage(offsetRef.current, false);
    setLoadingMore(false);
  }

  const grouped = groupEvents(events);

  if (loading) return <p className="text-xs text-text-muted">Loading...</p>;
  if (grouped.length === 0) return <p className="text-xs text-text-muted">No activity yet.</p>;

  return (
    <div className="flex flex-col">
      {grouped.map((e) => (
        <ActivityRow
          key={e.id}
          actorEmail={e.actorEmail}
          actorFirstName={e.actorFirstName}
          actorLastName={e.actorLastName}
          action={e.action}
          targetType={e.targetType}
          targetId={e.targetId}
          metadata={e.metadata}
          createdAt={e.createdAt}
          count={e.count}
          onTargetClick={onTargetClick}
        />
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 text-xs text-accent hover:underline disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
