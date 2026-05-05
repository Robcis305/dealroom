'use client';

import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';

type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

type ChipColor = 'green' | 'yellow' | 'red' | 'gray';

interface Summary {
  total: number;
  ready: number;
  byCategory: Record<
    'corporate_legal' | 'financial' | 'commercial' | 'team_hr' | 'ip_technical' | 'operations_risk',
    { total: number; ready: number }
  >;
  dealKillerGroups: Array<{
    group: DealKillerGroup;
    color: ChipColor;
  }>;
}

interface Props {
  summary: Summary;
  onOpenChecklist: () => void;
  onChipClick: (group: DealKillerGroup) => void;
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

const CATEGORY_LABEL = {
  corporate_legal: 'Corporate',
  financial: 'Financial',
  commercial: 'Commercial',
  team_hr: 'Team',
  ip_technical: 'IP/Tech',
  operations_risk: 'Ops',
} as const;

const CATEGORY_ORDER = [
  'corporate_legal',
  'financial',
  'commercial',
  'team_hr',
  'ip_technical',
  'operations_risk',
] as const;

export function ReadinessPanel({ summary, onOpenChecklist, onChipClick }: Props) {
  const pct = summary.total === 0 ? 0 : Math.round((summary.ready / summary.total) * 100);

  return (
    <section className="border border-border rounded-xl bg-surface p-5 mb-6">
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

      <div className="space-y-2">
        {CATEGORY_ORDER.map((cat) => {
          const c = summary.byCategory[cat];
          const ratio = c.total === 0 ? 0 : (c.ready / c.total) * 100;
          return (
            <div key={cat} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-text-muted shrink-0">{CATEGORY_LABEL[cat]}</span>
              <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-700/60 transition-all"
                  style={{ width: `${ratio}%` }}
                />
              </div>
              <span className="w-12 font-mono text-text-muted text-right shrink-0">
                {c.ready}/{c.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
