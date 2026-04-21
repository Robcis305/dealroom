'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  /** Items preserved after the action — reassurance for the user */
  preserves?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Primary-button visual treatment. `destructive` uses the brand-red outlined style. */
  tone?: 'destructive' | 'primary';
  /** If set, user must type this exact value before Confirm enables */
  requireTypedValue?: string;
  /** Label above the typed-confirmation input */
  typedValueLabel?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  preserves,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'destructive',
  requireTypedValue,
  typedValueLabel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTypedValue('');
      setBusy(false);
    }
  }, [open]);

  const typedMatches = !requireTypedValue || typedValue === requireTypedValue;
  const canConfirm = typedMatches && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-1.5">{title}</h2>
        {description && (
          <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
        )}
      </div>

      {preserves && preserves.length > 0 && (
        <div className="mb-4 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1.5">
            What's preserved
          </p>
          <ul className="space-y-1">
            {preserves.map((item, i) => (
              <li key={i} className="text-xs text-text-secondary leading-relaxed">
                — {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {requireTypedValue && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            {typedValueLabel ?? `Type ${requireTypedValue} to confirm`}
          </label>
          <input
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            autoFocus
            className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2
              text-sm text-text-primary placeholder:text-text-muted font-mono
              focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            placeholder={requireTypedValue}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'destructive' ? 'destructive' : 'primary'}
          size="sm"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
