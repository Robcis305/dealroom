'use client';

import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { DealKillerGroup, Stage } from '@/types';

type ChipColor = 'green' | 'yellow' | 'red' | 'gray';

type Summary =
  | {
      mode: 'canonical';
      total: number;
      ready: number;
      byStage: Record<
        1 | 2 | 3 | 4,
        { total: number; ready: number; label: string; dayRange: string }
      >;
      dealKillerGroups: Array<{
        group: DealKillerGroup;
        color: ChipColor;
      }>;
    }
  | {
      mode: 'simple';
      total: number;
      ready: number;
    };

interface Props {
  summary: Summary;
  onOpenChecklist: () => void;
  onChipClick: (group: DealKillerGroup) => void;
  onStageClick: (stage: Stage) => void;
}

const GROUP_LABEL: Record<DealKillerGroup, string> = {
  cap_table: 'Cap Table',
  eighty_three_b: '83(b) Filings',
  customer_coc: 'Customer COC',
  ip_assignment: 'IP Assignments',
  revenue_bridge: 'Revenue Bridge',
};

const COLOR_CLASS: Record<ChipColor, string> = {
  green: 'bg-emerald-950/40 text-emerald-200 border-emerald-800/60',
  yellow: 'bg-amber-950/40 text-amber-200 border-amber-800/60',
  red: 'bg-accent/20 text-accent border-accent/60',
  gray: 'bg-surface text-text-muted border-border',
};

const STAGES: Stage[] = [1, 2, 3, 4];

export function ReadinessPanel({ summary, onOpenChecklist, onChipClick, onStageClick }: Props) {
  const pct = summary.total === 0 ? 0 : Math.round((summary.ready / summary.total) * 100);

  // Simple mode — buy-side advisory workspaces
  if (summary.mode === 'simple') {
    return (
      <section className="border border-border rounded-xl bg-surface p-5 mb-6">
        <div className="flex items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
              Items received
            </div>
            <div className="text-2xl font-semibold text-text-primary tabular-nums">
              {summary.ready} / {summary.total}{' '}
              <span className="text-base font-normal text-text-muted ml-1">({pct}%)</span>
            </div>
          </div>
          <button
            onClick={onOpenChecklist}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-150 cursor-pointer shrink-0"
          >
            Open checklist
            <ArrowRight size={14} />
          </button>
        </div>

        {summary.total > 0 && (
          <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-700/50 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {summary.total === 0 && (
          <div className="text-xs text-text-muted py-1">
            No checklist uploaded yet. Open the checklist tab to import a CSV or XLSX request list.
          </div>
        )}
      </section>
    );
  }

  // Canonical mode — sell-side advisory workspaces (v1.4 layout, unchanged)
  return (
    <section className="border border-border rounded-xl bg-surface p-5 mb-6">
      {/* Headline */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Readiness
          </div>
          <div className="text-2xl font-semibold text-text-primary">
            {summary.ready} / {summary.total}{' '}
            <span className="text-base font-normal text-text-muted">({pct}%)</span>
          </div>
        </div>
        <button
          onClick={onOpenChecklist}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Open checklist
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Deal-killer chips — UNCHANGED */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {summary.dealKillerGroups.map((g) => (
          <button
            key={g.group}
            onClick={() => onChipClick(g.group)}
            className={clsx(
              'border rounded-lg px-3 py-2 text-xs text-left transition-colors hover:opacity-90',
              COLOR_CLASS[g.color],
            )}
          >
            <div className="font-medium">{GROUP_LABEL[g.group]}</div>
          </button>
        ))}
      </div>

      {/* Per-stage rows */}
      <div className="border-t border-border pt-4 mt-1">
        <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
          By Stage
        </div>

        <div className="space-y-1">
          {STAGES.map((stage) => {
            const s = summary.byStage[stage];
            const ratio = s.total === 0 ? 0 : (s.ready / s.total) * 100;
            const complete = s.total > 0 && s.ready === s.total;

            return (
              <button
                key={stage}
                onClick={() => onStageClick(stage)}
                aria-label={`Stage ${stage} · ${s.label}`}
                className={clsx(
                  'w-full text-left rounded-md px-2 py-2 min-h-[44px]',
                  'cursor-pointer transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-surface',
                  complete
                    ? 'hover:bg-emerald-950/30'
                    : 'hover:bg-surface-sunken/60',
                )}
              >
                {/* Desktop: single row */}
                <div className="hidden sm:flex items-center gap-3 text-xs">
                  <span className="font-mono text-[11px] text-text-muted shrink-0 w-12 tabular-nums">
                    Stage {stage}
                  </span>
                  <span className="text-text-primary font-medium shrink-0 w-36">
                    {s.label}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted shrink-0 w-20 tabular-nums">
                    {s.dayRange}
                  </span>
                  <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
                        complete ? 'bg-emerald-500' : 'bg-emerald-700/50',
                      )}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <span
                    className={clsx(
                      'font-mono text-[11px] shrink-0 w-10 text-right tabular-nums',
                      complete ? 'text-emerald-400' : 'text-text-muted',
                    )}
                  >
                    {s.ready}/{s.total}
                  </span>
                </div>

                {/* Mobile: two-line stack */}
                <div className="sm:hidden space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-text-muted tabular-nums">
                        Stage {stage}
                      </span>
                      <span className="text-xs font-medium text-text-primary">{s.label}</span>
                    </div>
                    <span
                      className={clsx(
                        'font-mono text-[11px] tabular-nums',
                        complete ? 'text-emerald-400' : 'text-text-muted',
                      )}
                    >
                      {s.ready}/{s.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text-muted tabular-nums shrink-0">
                      {s.dayRange}
                    </span>
                    <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
                          complete ? 'bg-emerald-500' : 'bg-emerald-700/50',
                        )}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
