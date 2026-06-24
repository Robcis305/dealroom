'use client';

import { useEffect, useState, useCallback } from 'react';
import { Layers, FileText, MessageSquare, Users, ChevronDown } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Member { participantId: string; firstName: string | null; lastName: string | null; email: string; role: string; }
interface ActivityItem { id: string; action: string; actorName: string; createdAt: string; metadata: unknown; }
interface DashboardData {
  workstream: { id: string; name: string; description: string | null; color: string; tileTint: string; docCount: number; memberCount: number; openQaCount: number; overdueCount: number };
  members: Member[];
  recentActivity: ActivityItem[];
}

interface Props {
  workspaceId: string;
  workstreamId: string;
  /** True for global admins and active cis_team/admin participants — gates Manage members button. */
  canManage?: boolean;
  /** Bump to force a re-fetch (e.g. after members change). */
  refreshKey?: number;
  onClearLens: () => void;
  onManageMembers?: () => void;
}

export function WorkstreamDashboard({ workspaceId, workstreamId, canManage, refreshKey, onClearLens, onManageMembers }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams/${workstreamId}`);
    if (res.ok) setData(await res.json());
  }, [workspaceId, workstreamId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data) return <p className="p-8 text-sm text-text-muted">Loading…</p>;
  const ws = data.workstream;

  const stats = [
    { key: 'docs', label: 'Documents', figure: ws.docCount, sub: 'across folders', accent: false },
    { key: 'qna', label: 'Open Q&A', figure: ws.openQaCount, sub: '—', accent: false },
    { key: 'overdue', label: 'Overdue', figure: ws.overdueCount, sub: '—', accent: true },
    { key: 'members', label: 'Members', figure: ws.memberCount, sub: 'on this workstream', accent: false },
  ];

  return (
    <div className="min-h-full bg-surface-elevated">
      {/* Breadcrumb + clear lens */}
      <div className="h-[58px] flex items-center justify-between px-6 border-b border-border bg-surface">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>Workstreams</span>
          <span className="text-text-muted">›</span>
          <span className="flex items-center gap-1.5 text-text-primary">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ws.color }} aria-hidden="true" />
            {ws.name}
          </span>
        </div>
        <button onClick={onClearLens} className="text-xs px-2.5 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors cursor-pointer">
          Clear lens
        </button>
      </div>

      <div className="p-5 w-full max-w-[1600px]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center border border-border" style={{ backgroundColor: ws.tileTint }}>
              <Layers size={20} className="text-text-secondary" />
            </div>
            <div>
              <h2 className="text-2xl font-medium text-text-primary tracking-tight">{ws.name}</h2>
              {ws.description && <p className="text-sm text-text-secondary mt-0.5">{ws.description}</p>}
            </div>
          </div>
          {canManage && onManageMembers && (
            <button onClick={onManageMembers} className="text-sm px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors cursor-pointer shrink-0">
              Manage members
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => {
            const cardBody = (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1">
                  {s.label}
                  {s.key === 'members' && (
                    <ChevronDown size={13} className={`transition-transform ${showMembers ? 'rotate-180' : ''}`} aria-hidden="true" />
                  )}
                </p>
                <p className={`text-[38px] leading-none font-medium tabular-nums mt-2 ${s.accent && s.figure > 0 ? 'text-[#C8281F]' : 'text-text-primary'}`}>{s.figure}</p>
                <p className="text-xs text-text-muted mt-2">{s.key === 'members' ? (showMembers ? 'hide list' : 'click to view') : s.sub}</p>
              </>
            );
            const base = `rounded-lg border p-4 bg-surface text-left ${s.accent && s.figure > 0 ? 'border-[#F3C9C7]' : 'border-border'}`;
            return s.key === 'members' ? (
              <button
                key={s.key}
                type="button"
                onClick={() => setShowMembers((v) => !v)}
                aria-expanded={showMembers}
                className={`${base} hover:border-accent transition-colors cursor-pointer`}
              >
                {cardBody}
              </button>
            ) : (
              <div key={s.key} className={base}>{cardBody}</div>
            );
          })}
        </div>

        {/* Members reveal — who is on this workstream */}
        {showMembers && (
          <div className="rounded-lg border border-border bg-surface p-4 mb-6">
            <p className="text-sm font-medium text-text-primary flex items-center gap-2 mb-3"><Users size={15} /> Workstream members</p>
            {data.members.length === 0 ? (
              <p className="text-sm text-text-muted">No members yet.{canManage && onManageMembers ? ' Use “Manage members” to add people.' : ''}</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.members.map((m) => {
                  const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
                  return (
                    <li key={m.participantId} className="flex items-center gap-2 text-sm py-1">
                      <span className="w-7 h-7 rounded-full bg-surface-elevated border border-border flex items-center justify-center shrink-0 text-xs text-text-muted">
                        {(name[0] ?? '?').toUpperCase()}
                      </span>
                      <span className="text-text-primary truncate">{name}</span>
                      <span className="text-xs text-text-muted ml-auto">{m.role}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Two-column: activity + quick links */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-sm font-medium text-text-primary mb-3">Recent activity</p>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-text-muted">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="w-7 h-7 rounded-full bg-surface-elevated border border-border flex items-center justify-center shrink-0 text-xs text-text-muted">•</span>
                    <span className="text-text-secondary"><span className="text-text-primary">{a.actorName}</span> {a.action.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-medium text-text-primary flex items-center gap-2"><FileText size={15} /> {ws.name} documents</p>
              <p className="text-xs text-text-muted mt-1">{ws.docCount} files tagged {ws.name}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-medium text-text-primary flex items-center gap-2"><MessageSquare size={15} /> {ws.name} Q&A</p>
              <p className="text-xs text-text-muted mt-1">Available in the Q&A module</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
