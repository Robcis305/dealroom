'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { CANONICAL_WORKSTREAMS } from '@/lib/workstreams/constants';

interface StepWorkstreamsProps {
  workspaceId: string;
  onDone: (created: { id: string; name: string }[]) => void;
  onSkip: () => void;
  registerCommit: (fn: (() => Promise<boolean>) | null) => void;
}

export function StepWorkstreams({ workspaceId, onDone, registerCommit }: StepWorkstreamsProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    registerCommit(async (): Promise<boolean> => {
      const toCreate = CANONICAL_WORKSTREAMS.filter((ws) => checked.has(ws.key));

      if (toCreate.length === 0) {
        onDone([]);
        return true;
      }

      setErrors({});
      setSubmitting(true);
      const newErrors: Record<string, string> = {};
      const created: { id: string; name: string }[] = [];

      await Promise.allSettled(
        toCreate.map(async (ws) => {
          try {
            const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/workstreams`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: ws.key }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              newErrors[ws.key] =
                (body as { error?: string }).error ?? `Failed to create "${ws.name}"`;
            } else {
              const body = await res.json();
              created.push({ id: body.workstream.id, name: body.workstream.name });
            }
          } catch {
            newErrors[ws.key] = `Network error creating "${ws.name}"`;
          }
        })
      );

      setSubmitting(false);

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

      onDone(created);
      return true;
    });
    return () => registerCommit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, checked, onDone, registerCommit]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Workstreams</h2>
        <p className="text-sm text-text-muted mt-1">
          Select which workstreams to activate for this deal.
        </p>
      </div>

      <div className="space-y-2">
        {CANONICAL_WORKSTREAMS.map((ws) => (
          <div key={ws.key}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent w-4 h-4 cursor-pointer"
                checked={checked.has(ws.key)}
                onChange={() => toggle(ws.key)}
                disabled={submitting}
                aria-label={ws.name}
              />
              <span
                className="w-3 h-3 rounded-full inline-block shrink-0"
                style={{ backgroundColor: ws.color }}
              />
              <span className="text-sm text-text-primary">{ws.name}</span>
            </label>
            {errors[ws.key] && (
              <p className="ml-6 mt-0.5 text-xs text-accent">{errors[ws.key]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
