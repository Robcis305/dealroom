'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { WorkspaceStatus, CisAdvisorySide } from '@/types';

const newDealSchema = z.object({
  name: z.string().min(1, 'Deal codename is required'),
  clientName: z.string().min(1, 'Client name is required'),
  cisAdvisorySide: z.enum(['buyer_side', 'seller_side'], {
    error: 'Advisory side is required',
  }),
  status: z.enum([
    'engagement',
    'active_dd',
    'ioi_stage',
    'closing',
    'closed',
    'archived',
  ]),
});

type NewDealForm = z.infer<typeof newDealSchema>;

interface NewDealModalProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: WorkspaceStatus; label: string }[] = [
  { value: 'engagement', label: 'Engagement' },
  { value: 'active_dd', label: 'Active DD' },
  { value: 'ioi_stage', label: 'IOI Stage' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

export function NewDealModal({ open, onClose }: NewDealModalProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<{
    name: string;
    clientName: string;
    cisAdvisorySide: CisAdvisorySide | '';
    status: WorkspaceStatus;
  }>({
    name: '',
    clientName: '',
    cisAdvisorySide: '',
    status: 'engagement',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof NewDealForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setFormData({ name: '', clientName: '', cisAdvisorySide: '', status: 'engagement' });
    setErrors({});
    setServerError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    // Validate
    const result = newDealSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof NewDealForm, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof NewDealForm;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const response = await fetchWithAuth('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        const body = await response.json();
        setServerError(body.error ?? 'Something went wrong. Please try again.');
        return;
      }

      const workspace = await response.json();
      handleClose();
      router.push(`/workspace/${workspace.id}`);
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Deal Room">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Deal Codename */}
        <Input
          id="deal-name"
          label="Deal Codename"
          placeholder="e.g. Project Falcon"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          error={errors.name}
          autoFocus
        />

        {/* Client Name */}
        <Input
          id="client-name"
          label="Client Name (admin-visible only)"
          placeholder="e.g. Acme Corporation"
          value={formData.clientName}
          onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
          error={errors.clientName}
        />

        {/* CIS Advisory Side — radio group */}
        <fieldset>
          <legend className="block text-sm font-medium text-text-secondary mb-2">
            CIS Advisory Side
          </legend>
          <div className="flex gap-4">
            {(['buyer_side', 'seller_side'] as const).map((side) => (
              <label
                key={side}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="cisAdvisorySide"
                  value={side}
                  checked={formData.cisAdvisorySide === side}
                  onChange={() =>
                    setFormData((prev) => ({ ...prev, cisAdvisorySide: side }))
                  }
                  className="accent-accent w-4 h-4 cursor-pointer"
                />
                <span className="text-sm text-text-primary">
                  {side === 'buyer_side' ? 'Buyer-side' : 'Seller-side'}
                </span>
              </label>
            ))}
          </div>
          {errors.cisAdvisorySide && (
            <p className="mt-1 text-xs text-accent">{errors.cisAdvisorySide}</p>
          )}
        </fieldset>

        {/* Initial Status — dropdown */}
        <div>
          <label
            htmlFor="deal-status"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Initial Status
          </label>
          <select
            id="deal-status"
            value={formData.status}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                status: e.target.value as WorkspaceStatus,
              }))
            }
            className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2
              text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent
              focus:border-transparent cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.status && (
            <p className="mt-1 text-xs text-accent">{errors.status}</p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <p className="text-xs text-accent bg-accent-subtle border border-accent/20
            rounded-lg px-3 py-2">
            {serverError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="flex-1"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="flex-1"
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Deal Room'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
