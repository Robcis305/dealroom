'use client';

import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface Participant { id: string; firstName: string | null; lastName: string | null; email: string; role: string; status: string; }

interface Props {
  workspaceId: string;
  workstreamId: string;
  workstreamName: string;
  onClose: () => void;
  onChanged: () => void;
}

export function WorkstreamMembersModal({ workspaceId, workstreamId, workstreamName, onClose, onChanged }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  // initialIds = who is currently a member (server truth); selected = the staged choice.
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

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
      const ids = new Set((members as Array<{ participantId: string }>).map((m) => m.participantId));
      setInitialIds(ids);
      setSelected(new Set(ids));
    }
  }, [workspaceId, workstreamId]);

  useEffect(() => { load(); }, [load]);

  function toggle(participantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  const toAdd = [...selected].filter((id) => !initialIds.has(id));
  const toRemove = [...initialIds].filter((id) => !selected.has(id));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  async function save() {
    if (!hasChanges || saving) return;
    setSaving(true);
    const url = `/api/workspaces/${workspaceId}/workstreams/${workstreamId}/members`;
    const errors: string[] = [];

    await Promise.all([
      ...toAdd.map(async (participantId) => {
        const res = await fetchWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId }),
        });
        if (!res.ok) {
          const msg = await res.json().then((d) => d.error).catch(() => null);
          errors.push(typeof msg === 'string' ? msg : 'Could not add a member');
        }
      }),
      ...toRemove.map(async (participantId) => {
        const res = await fetchWithAuth(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId }),
        });
        if (!res.ok) {
          const msg = await res.json().then((d) => d.error).catch(() => null);
          errors.push(typeof msg === 'string' ? msg : 'Could not remove a member');
        }
      }),
    ]);

    setSaving(false);

    if (errors.length > 0) {
      // Surface the most informative message (e.g. "hasn't accepted their invite yet").
      toast.error(errors[0]);
      await load(); // resync to whatever actually persisted
      onChanged();
      return;
    }

    const parts: string[] = [];
    if (toAdd.length) parts.push(`added ${toAdd.length}`);
    if (toRemove.length) parts.push(`removed ${toRemove.length}`);
    toast.success(`${workstreamName} members updated — ${parts.join(', ')}.`);
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,10,0.42)' }} onClick={onClose}>
      <div className="bg-surface border border-border rounded-[10px] w-full max-w-[480px] max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-base font-semibold text-text-primary">Manage {workstreamName} members</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary cursor-pointer"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-2 flex-1 min-h-0">
          {(() => {
            const eligible = participants.filter((p) => p.status === 'active' && p.role !== 'view_only');
            const excluded = participants.length - eligible.length;
            return (
              <>
                {eligible.map((p) => {
                  const checked = selected.has(p.id);
                  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
                  return (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-elevated cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="accent-accent" disabled={saving} />
                      <span className="text-sm text-text-primary">{name}</span>
                      <span className="text-xs text-text-muted ml-auto">{p.role}</span>
                    </label>
                  );
                })}
                {eligible.length === 0 && <p className="p-4 text-sm text-text-muted">No participants to add.</p>}
                {excluded > 0 && (
                  <p className="px-3 py-2 text-xs text-text-muted">
                    {excluded} participant{excluded === 1 ? '' : 's'} not shown (pending invite or view-only).
                  </p>
                )}
              </>
            );
          })()}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border shrink-0">
          <span className="text-xs text-text-muted">
            {hasChanges
              ? [toAdd.length ? `${toAdd.length} to add` : null, toRemove.length ? `${toRemove.length} to remove` : null].filter(Boolean).join(', ')
              : 'No changes'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-sm px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!hasChanges || saving}
              className="text-sm px-3 py-1.5 rounded-md bg-accent text-text-inverse hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
