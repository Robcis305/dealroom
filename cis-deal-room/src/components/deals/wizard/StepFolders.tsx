'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** Folders already created in a previous commit of this step (passed back in on remount). */
  initialCreated?: { id: string; name: string }[];
  onDone: (createdFolders: { id: string; name: string }[]) => void;
  onSkip: () => void;
  registerCommit: (fn: (() => Promise<boolean>) | null) => void;
}

export function StepFolders({ workspaceId, initialCreated, onDone, registerCommit }: StepFoldersProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(CANONICAL_FOLDERS));
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Tracks folders already successfully created this wizard session (keyed by lower-case name).
  // Seeded from initialCreated so remounts (Back → Next) don't re-POST.
  // Using a ref so the commit closure always sees the latest value without re-registering.
  const alreadyCreatedRef = useRef<{ id: string; name: string }[]>(initialCreated ?? []);

  useEffect(() => {
    registerCommit(async (): Promise<boolean> => {
      const targetNames = [
        ...CANONICAL_FOLDERS.filter((f) => checked.has(f)),
        ...customFolders,
      ];

      // Determine which names still need to be created (case-insensitive dedup).
      const createdNamesLower = new Set(
        alreadyCreatedRef.current.map((f) => f.name.trim().toLowerCase())
      );
      const toCreate = targetNames.filter(
        (name) => !createdNamesLower.has(name.trim().toLowerCase())
      );

      // Nothing new to POST — return immediately with the full accumulated list.
      if (toCreate.length === 0) {
        onDone(alreadyCreatedRef.current);
        return true;
      }

      setErrors({});
      setSubmitting(true);
      const newlyCreated: { id: string; name: string }[] = [];
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
            newlyCreated.push({ id: folder.id as string, name: folder.name as string });
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

      // Accumulate newly created folders into the session ref and call onDone with the full list.
      alreadyCreatedRef.current = [...alreadyCreatedRef.current, ...newlyCreated];
      onDone(alreadyCreatedRef.current);
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
