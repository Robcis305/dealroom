'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { CisAdvisorySide } from '@/types';

const stepDetailsSchema = z.object({
  name: z.string().min(1, 'Deal codename is required'),
  clientName: z.string().min(1, 'Client name is required'),
  cisAdvisorySide: z.enum(['buyer_side', 'seller_side'], {
    error: 'Advisory side is required',
  }),
});

type StepDetailsForm = z.infer<typeof stepDetailsSchema>;

interface StepDetailsProps {
  onCreated: (ws: { id: string; cisAdvisorySide: CisAdvisorySide }) => void;
  onError: (msg: string) => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  registerCommit?: (fn: () => Promise<boolean>) => void;
}

export function StepDetails({ onCreated, onError, submitting, setSubmitting, registerCommit }: StepDetailsProps) {
  const [formData, setFormData] = useState<{
    name: string;
    clientName: string;
    cisAdvisorySide: CisAdvisorySide | '';
  }>({
    name: '',
    clientName: '',
    cisAdvisorySide: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof StepDetailsForm, string>>>({});

  async function submit(): Promise<boolean> {
    const result = stepDetailsSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof StepDetailsForm, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof StepDetailsForm;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const response = await fetchWithAuth('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result.data, status: 'engagement' }),
      });
      if (!response.ok) {
        const body = await response.json();
        onError(body.error ?? 'Something went wrong. Please try again.');
        return false;
      }
      const workspace = await response.json();
      onCreated({ id: workspace.id, cisAdvisorySide: result.data.cisAdvisorySide });
      return true;
    } catch {
      onError('Network error. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // Register commit fn with the container so Next button can trigger it
  useEffect(() => {
    registerCommit?.(submit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, registerCommit]);

  return (
    <form
      id="step-details-form"
      noValidate
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <Input
        id="deal-name"
        label="Deal Codename"
        placeholder="e.g. Project Falcon"
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        error={errors.name}
        autoFocus
      />
      <Input
        id="client-name"
        label="Client Name (admin-visible only)"
        placeholder="e.g. Acme Corporation"
        value={formData.clientName}
        onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
        error={errors.clientName}
      />
      <fieldset>
        <legend className="block text-sm font-medium text-text-secondary mb-2">
          CIS Advisory Side
        </legend>
        <div className="flex gap-4">
          {(['buyer_side', 'seller_side'] as const).map((side) => (
            <label key={side} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="cisAdvisorySide"
                value={side}
                checked={formData.cisAdvisorySide === side}
                onChange={() => setFormData((prev) => ({ ...prev, cisAdvisorySide: side }))}
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
    </form>
  );
}
