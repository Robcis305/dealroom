'use client';

import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Participant { id: string; firstName: string | null; lastName: string | null; email: string; role: string; }
interface Member { participantId: string; }

interface Props {
  workspaceId: string;
  workstreamId: string;
  workstreamName: string;
  onClose: () => void;
  onChanged: () => void;
}

export function WorkstreamMembersModal({ workspaceId, workstreamId, workstreamName, onClose, onChanged }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [pRes, mRes] = await Promise.all([
      fetchWithAuth(`/api/workspaces/${workspaceId}/participants`),
      fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams/${workstreamId}/members`),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setParticipants(Array.isArray(data) ? data : data.participants ?? []);
    }
    if (mRes.ok) {
      const { members } = await mRes.json();
      setMemberIds(new Set((members as Array<{ participantId: string }>).map((m) => m.participantId)));
    }
  }, [workspaceId, workstreamId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(participantId: string) {
    const isMember = memberIds.has(participantId);
    const next = new Set(memberIds);
    if (isMember) next.delete(participantId); else next.add(participantId);
    setMemberIds(next); // optimistic
    await fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams/${workstreamId}/members`, {
      method: isMember ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId }),
    });
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(10,10,10,0.42)' }} onClick={onClose}>
      <div className="bg-surface border border-border rounded-[10px] w-[480px] max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">Manage {workstreamName} members</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary cursor-pointer"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {participants.map((p) => {
            const checked = memberIds.has(p.id);
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
            return (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-elevated cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="accent-accent" />
                <span className="text-sm text-text-primary">{name}</span>
                <span className="text-xs text-text-muted ml-auto">{p.role}</span>
              </label>
            );
          })}
          {participants.length === 0 && <p className="p-4 text-sm text-text-muted">No participants to add.</p>}
        </div>
      </div>
    </div>
  );
}
