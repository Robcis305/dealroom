'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface WelcomeModalProps {
  workspaceId: string;
  dealName: string;
  roleLabel: string;
  folders: string[];
  workstreams: string[];
  onDismiss: () => void;
}

export function WelcomeModal({
  workspaceId,
  dealName,
  roleLabel,
  folders,
  workstreams,
  onDismiss,
}: WelcomeModalProps) {
  const [busy, setBusy] = useState(false);

  async function handleEnter() {
    if (busy) return;
    setBusy(true);
    try {
      await fetchWithAuth(`/api/workspaces/${workspaceId}/onboarded`, {
        method: 'POST',
      });
      onDismiss();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={handleEnter} title={`Welcome to ${dealName}`}>
      <div className="flex flex-col gap-4 flex-1">
        <p className="text-sm text-text-secondary">
          You&apos;ve been added as <strong className="text-text-primary">{roleLabel}</strong>.
        </p>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
            Folders you can access
          </h3>
          {folders.length === 0 ? (
            <p className="text-sm text-text-muted">No folders yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {folders.map((name) => (
                <li key={name} className="text-sm text-text-primary">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
            Workstreams you&apos;re on
          </h3>
          {workstreams.length === 0 ? (
            <p className="text-sm text-text-muted">No workstreams yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {workstreams.map((name) => (
                <li key={name} className="text-sm text-text-primary">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 pt-4 flex justify-end">
        <button
          type="button"
          onClick={handleEnter}
          disabled={busy}
          className="bg-accent hover:bg-accent-hover text-text-inverse text-sm font-medium
            px-4 py-2 rounded-lg transition-colors cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
            focus:ring-offset-surface disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Loading…' : 'Enter deal room'}
        </button>
      </div>
    </Modal>
  );
}
