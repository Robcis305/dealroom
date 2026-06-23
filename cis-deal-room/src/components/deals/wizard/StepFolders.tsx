'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

export const CANONICAL_FOLDERS = [
  'Financials',
  'Legal',
  'Operations',
  'Human Capital',
  'Tax',
  'Technology',
  'Deal Documents',
  'Miscellaneous',
] as const;

interface StepFoldersProps {
  workspaceId: string;
  onDone: (createdFolders: { id: string; name: string }[]) => void;
  onSkip: () => void;
  registerCommit: (fn: (() => Promise<boolean>) | null) => void;
}

export function StepFolders({ workspaceId, onDone, registerCommit }: StepFoldersProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(CANONICAL_FOLDERS));
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    registerCommit(async (): Promise<boolean> => {
      const toCreate = [
        ...CANONICAL_FOLDERS.filter((f) => checked.has(f)),
        ...customFolders,
      ];
      setErrors({});
      setSubmitting(true);
      const results: { id: string; name: string }[] = [];
      const newErrors: Record<string, string> = {};

      await Promise.allSettled(
        toCreate.map(async (name) => {
          try {
            const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/folders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              newErrors[name] =
                (body as { error?: string }).error ?? `Failed to create "${name}"`;
              return;
            }
            const folder = await res.json();
            results.push({ id: folder.id as string, name: folder.name as string });
          } catch {
            newErrors[name] = `Network error creating "${name}"`;
          }
        })
      );

      setSubmitting(false);

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

      onDone(results);
      return true;
    });
    return () => registerCommit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, checked, customFolders, onDone, registerCommit]);

  function toggleCanonical(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomFolders((prev) => [...prev, trimmed]);
    setCustomInput('');
  }

  function removeCustom(name: string) {
    setCustomFolders((prev) => prev.filter((f) => f !== name));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Folders</h2>
        <p className="text-sm text-text-muted mt-1">
          Select which folders to create. Uncheck any you don&apos;t need, or add custom ones.
        </p>
      </div>

      <div className="space-y-2">
        {CANONICAL_FOLDERS.map((name) => (
          <div key={name}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent w-4 h-4 cursor-pointer"
                checked={checked.has(name)}
                onChange={() => toggleCanonical(name)}
                disabled={submitting}
                aria-label={name}
              />
              <span className="text-sm text-text-primary">{name}</span>
            </label>
            {errors[name] && (
              <p className="ml-6 mt-0.5 text-xs text-accent">{errors[name]}</p>
            )}
          </div>
        ))}

        {customFolders.map((name) => (
          <div key={name}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent w-4 h-4"
                checked
                readOnly
                disabled={submitting}
                aria-label={name}
              />
              <span className="text-sm text-text-primary">{name}</span>
              <button
                type="button"
                onClick={() => removeCustom(name)}
                className="ml-auto text-xs text-text-muted hover:text-accent"
                aria-label={`Remove ${name}`}
                disabled={submitting}
              >
                Remove
              </button>
            </div>
            {errors[name] && (
              <p className="ml-6 mt-0.5 text-xs text-accent">{errors[name]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Add custom folder */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add a custom folder…"
          className="flex-1 text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
          disabled={submitting}
        />
        <button
          type="button"
          onClick={addCustom}
          className="text-sm px-3 py-1.5 rounded-md border border-border bg-surface-sunken text-text-secondary hover:text-text-primary disabled:opacity-50"
          disabled={submitting || !customInput.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}
