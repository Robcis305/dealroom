'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StepDetails } from './wizard/StepDetails';
import { StepFolders } from './wizard/StepFolders';
import { StepWorkstreams } from './wizard/StepWorkstreams';
import type { CisAdvisorySide } from '@/types';

type WizardStep = 'details' | 'folders' | 'workstreams' | 'invite';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'folders', label: 'Folders' },
  { key: 'workstreams', label: 'Workstreams' },
  { key: 'invite', label: 'Invite' },
];

const STEP_KEYS = STEPS.map((s) => s.key);

interface NewDealWizardProps {
  open: boolean;
  onClose: () => void;
}

export function NewDealWizard({ open, onClose }: NewDealWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('details');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [, setCisAdvisorySide] = useState<CisAdvisorySide | null>(null);
  const [, setCreatedFolders] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const stepActionRef = useRef<null | (() => Promise<boolean>)>(null);

  function registerCommit(fn: (() => Promise<boolean>) | null) {
    stepActionRef.current = fn;
  }

  const currentIndex = STEP_KEYS.indexOf(step);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === STEP_KEYS.length - 1;

  function advance() {
    if (!isLast) {
      setStep(STEP_KEYS[currentIndex + 1]);
    }
  }

  function goBack() {
    if (!isFirst) {
      setStep(STEP_KEYS[currentIndex - 1]);
    }
  }

  function handleClose() {
    if (workspaceId) {
      router.push(`/workspace/${workspaceId}`);
    } else {
      onClose();
    }
  }

  function handleFinish() {
    if (workspaceId) {
      router.push(`/workspace/${workspaceId}`);
    }
  }

  function handleCreated(ws: { id: string; cisAdvisorySide: CisAdvisorySide }) {
    setWorkspaceId(ws.id);
    setCisAdvisorySide(ws.cisAdvisorySide);
    // Do NOT advance here — handleNext advances after commit returns true
  }

  async function handleNext() {
    if (stepActionRef.current) {
      const ok = await stepActionRef.current();
      if (ok) advance();
    } else {
      advance();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Deal Room" className="max-w-xl">
      {/* Progress header */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                  s.key === step
                    ? 'bg-accent text-text-inverse'
                    : currentIndex > i
                      ? 'bg-accent/30 text-accent'
                      : 'bg-surface-sunken text-text-muted',
                ].join(' ')}
              >
                {i + 1}
              </div>
              <span
                className={[
                  'text-xs mt-1 truncate w-full text-center',
                  s.key === step ? 'text-accent font-medium' : 'text-text-muted',
                ].join(' ')}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'h-px flex-1 mb-5',
                  currentIndex > i ? 'bg-accent/40' : 'bg-border',
                ].join(' ')}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step body */}
      <div className="min-h-[200px]">
        {step === 'details' && (
          <StepDetails
            onCreated={handleCreated}
            onError={(msg) => setServerError(msg)}
            submitting={submitting}
            setSubmitting={setSubmitting}
            registerCommit={registerCommit}
          />
        )}
        {step === 'folders' && workspaceId && (
          <StepFolders
            workspaceId={workspaceId}
            onDone={(folders) => setCreatedFolders(folders)}
            onSkip={advance}
            registerCommit={registerCommit}
          />
        )}
        {step === 'workstreams' && workspaceId && (
          <StepWorkstreams
            workspaceId={workspaceId}
            onDone={advance}
            onSkip={advance}
            registerCommit={registerCommit}
          />
        )}
        {step === 'invite' && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-text-primary">Invite team</h2>
            <p className="text-sm text-text-muted">
              Team invitations coming in the next task.
            </p>
          </div>
        )}
      </div>

      {/* Server error */}
      {serverError && (
        <p className="mt-3 text-xs text-accent bg-accent-subtle border border-accent/20 rounded-lg px-3 py-2">
          {serverError}
        </p>
      )}

      {/* Footer */}
      <div className="flex gap-3 pt-4 mt-2 border-t border-border">
        {/* Left side: Cancel on first step, Back on subsequent steps */}
        {isFirst ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={goBack}
            disabled={submitting}
          >
            Back
          </Button>
        )}

        <div className="flex gap-3 ml-auto">
          {/* Skip — only shown on middle steps (not first, not last) */}
          {!isFirst && !isLast && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={advance}
              disabled={submitting}
            >
              Skip
            </Button>
          )}

          {/* Next / Finish */}
          {isLast ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleFinish}
              disabled={submitting}
            >
              Finish
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleNext}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Next'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
