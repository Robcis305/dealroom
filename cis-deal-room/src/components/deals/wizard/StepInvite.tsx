'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { assignableRolesFor } from '@/lib/participants/roles';
import type { ParticipantRole, CisAdvisorySide } from '@/types';

interface InviteRow {
  id: number;
  email: string;
  role: ParticipantRole;
  folderIds: string[];
  workstreamIds: string[];
  error: string | null;
}

interface StepInviteProps {
  workspaceId: string;
  cisAdvisorySide: CisAdvisorySide;
  folders: { id: string; name: string }[];
  workstreams: { id: string; name: string }[];
  onDone: () => void;
  registerCommit: (fn: (() => Promise<boolean>) | null) => void;
}

let nextId = 1;

function makeRow(defaultRole: ParticipantRole): InviteRow {
  return { id: nextId++, email: '', role: defaultRole, folderIds: [], workstreamIds: [], error: null };
}

export function StepInvite({
  workspaceId,
  cisAdvisorySide,
  folders,
  workstreams,
  onDone,
  registerCommit,
}: StepInviteProps) {
  const roles = assignableRolesFor(cisAdvisorySide);
  const defaultRole = roles[0]?.value ?? 'view_only';

  const [rows, setRows] = useState<InviteRow[]>([makeRow(defaultRole as ParticipantRole)]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    registerCommit(async (): Promise<boolean> => {
      const toSubmit = rows.filter((r) => r.email.trim() !== '');

      if (toSubmit.length === 0) {
        onDone();
        return true;
      }

      setSubmitting(true);

      // Clear previous errors
      setRows((prev) => prev.map((r) => ({ ...r, error: null })));

      const newErrors: Record<number, string> = {};

      await Promise.allSettled(
        toSubmit.map(async (row) => {
          try {
            const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/participants`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: row.email.trim(),
                role: row.role,
                folderIds: row.folderIds,
                workstreamIds: [...row.workstreamIds],
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              newErrors[row.id] =
                (body as { error?: string }).error ?? `Failed to invite "${row.email}"`;
            }
          } catch {
            newErrors[row.id] = `Network error inviting "${row.email}"`;
          }
        })
      );

      setSubmitting(false);

      if (Object.keys(newErrors).length > 0) {
        setRows((prev) =>
          prev.map((r) => ({
            ...r,
            error: newErrors[r.id] ?? null,
          }))
        );
        return false;
      }

      onDone();
      return true;
    });
    return () => registerCommit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, rows, onDone, registerCommit]);

  function addRow() {
    setRows((prev) => [...prev, makeRow(defaultRole as ParticipantRole)]);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: number, patch: Partial<InviteRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleFolder(rowId: number, folderId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const has = r.folderIds.includes(folderId);
        return {
          ...r,
          folderIds: has
            ? r.folderIds.filter((id) => id !== folderId)
            : [...r.folderIds, folderId],
        };
      })
    );
  }

  function toggleAllFolders(rowId: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const allSelected = folders.every((f) => r.folderIds.includes(f.id));
        return {
          ...r,
          folderIds: allSelected ? [] : folders.map((f) => f.id),
        };
      })
    );
  }

  function toggleWorkstream(rowId: number, workstreamId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const has = r.workstreamIds.includes(workstreamId);
        return {
          ...r,
          workstreamIds: has
            ? r.workstreamIds.filter((id) => id !== workstreamId)
            : [...r.workstreamIds, workstreamId],
        };
      })
    );
  }

  function toggleAllWorkstreams(rowId: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const allSelected = workstreams.every((ws) => r.workstreamIds.includes(ws.id));
        return {
          ...r,
          workstreamIds: allSelected ? [] : workstreams.map((ws) => ws.id),
        };
      })
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Invite team</h2>
        <p className="text-sm text-text-muted mt-1">
          Add people to this deal room. You can also do this later.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => {
          const showFolderHint =
            row.role !== 'cis_team' &&
            row.role !== 'admin' &&
            row.folderIds.length === 0;

          const allFoldersSelected =
            folders.length > 0 && folders.every((f) => row.folderIds.includes(f.id));

          const allWorkstreamsSelected =
            workstreams.length > 0 && workstreams.every((ws) => row.workstreamIds.includes(ws.id));

          return (
            <div
              key={row.id}
              className="border border-border rounded-lg p-3 space-y-3 bg-surface"
            >
              {/* Row header: email + role + remove */}
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(row.id, { email: e.target.value })}
                  placeholder="Email address"
                  aria-label={`Email address ${index + 1}`}
                  className="flex-1 text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                  disabled={submitting}
                />
                <select
                  value={row.role}
                  onChange={(e) =>
                    updateRow(row.id, { role: e.target.value as ParticipantRole })
                  }
                  aria-label={`Role ${index + 1}`}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                  disabled={submitting}
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove row ${index + 1}`}
                    className="text-xs text-text-muted hover:text-accent shrink-0"
                    disabled={submitting}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Folder access */}
              {folders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-text-muted font-medium">Folder access</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4 cursor-pointer"
                      checked={allFoldersSelected}
                      onChange={() => toggleAllFolders(row.id)}
                      disabled={submitting}
                      aria-label="All folders"
                    />
                    <span className="text-sm text-text-primary">All folders</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {folders.map((folder) => (
                      <label key={folder.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-accent w-4 h-4 cursor-pointer"
                          checked={row.folderIds.includes(folder.id)}
                          onChange={() => toggleFolder(row.id, folder.id)}
                          disabled={submitting}
                          aria-label={folder.name}
                        />
                        <span className="text-sm text-text-primary truncate">{folder.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Workstream access */}
              {workstreams.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-text-muted font-medium">Workstream access</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4 cursor-pointer"
                      checked={allWorkstreamsSelected}
                      onChange={() => toggleAllWorkstreams(row.id)}
                      disabled={submitting}
                      aria-label="All workstreams"
                    />
                    <span className="text-sm text-text-primary">All workstreams</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {workstreams.map((ws) => (
                      <label key={ws.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-accent w-4 h-4 cursor-pointer"
                          checked={row.workstreamIds.includes(ws.id)}
                          onChange={() => toggleWorkstream(row.id, ws.id)}
                          disabled={submitting}
                          aria-label={ws.name}
                        />
                        <span className="text-sm text-text-primary truncate">{ws.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Folder hint */}
              {showFolderHint && folders.length > 0 && (
                <p className="text-xs text-text-muted">
                  They won&apos;t see documents until granted folder access.
                </p>
              )}

              {/* Per-row error */}
              {row.error && (
                <p className="text-xs text-accent">{row.error}</p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-sm text-accent hover:underline disabled:opacity-50"
        disabled={submitting}
      >
        + Add another person
      </button>
    </div>
  );
}
