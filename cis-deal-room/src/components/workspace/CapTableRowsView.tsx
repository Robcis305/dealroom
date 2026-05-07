'use client';

import type { CapTableInstrument } from '@/types';

interface Row {
  id: string;
  rowNumber: number;
  holder: string;
  className: string;
  instrument: CapTableInstrument;
  shares: number;
  ownershipPercent: string;
  pricePerShare: string;
  amountInvested: string;
  round: string | null;
  roundValuation: string | null;
  vestingStart: string | null;
  vestingSchedule: string | null;
  certificateNumber: string | null;
  notes: string | null;
}

interface Props {
  rows: Row[];
}

const INSTRUMENT_ORDER: CapTableInstrument[] = [
  'common',
  'preferred',
  'option',
  'rsu',
  'warrant',
  'safe',
  'convertible_note',
];

const INSTRUMENT_LABEL: Record<CapTableInstrument, string> = {
  common: 'Common Stock',
  preferred: 'Preferred Stock',
  option: 'Options',
  rsu: 'RSUs',
  warrant: 'Warrants',
  safe: 'SAFEs',
  convertible_note: 'Convertible Notes',
};

export function CapTableRowsView({ rows }: Props) {
  const groups = new Map<CapTableInstrument, Row[]>();
  for (const r of rows) {
    const list = groups.get(r.instrument) ?? [];
    list.push(r);
    groups.set(r.instrument, list);
  }

  return (
    <section>
      {INSTRUMENT_ORDER.filter((i) => groups.has(i)).map((inst) => {
        const items = groups.get(inst)!.sort((a, b) => a.holder.localeCompare(b.holder));
        const totalShares = items.reduce((acc, r) => acc + r.shares, 0);
        const totalInvested = items.reduce((acc, r) => acc + Number(r.amountInvested), 0);
        const totalPercent = items.reduce((acc, r) => acc + Number(r.ownershipPercent), 0);

        return (
          <div key={inst} className="mb-6">
            {/* Sticky group heading */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-base border-b border-border px-3 py-2">
              <h3
                className="text-[10px] font-medium text-text-muted uppercase tracking-widest"
                role="heading"
                aria-level={3}
              >
                {INSTRUMENT_LABEL[inst]}
              </h3>
              <span className="font-mono text-[10px] text-text-muted">{items.length}</span>
            </div>

            {/* Table */}
            <div className="border border-border rounded-b-xl overflow-x-auto bg-surface">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Holder</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Class</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">Shares</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">%</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">Price</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-medium text-text-muted uppercase tracking-wider">Invested</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Round</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Vesting</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/50 hover:bg-surface-sunken/40 transition-colors duration-150"
                    >
                      <td className="px-3 py-2.5 text-sm text-text-primary whitespace-nowrap">{r.holder}</td>
                      <td className="px-3 py-2.5 text-sm text-text-secondary whitespace-nowrap">{r.className}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-text-secondary tabular-nums">{r.shares.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-text-secondary tabular-nums">{Number(r.ownershipPercent).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-text-muted tabular-nums">${Number(r.pricePerShare).toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-text-muted tabular-nums">${Number(r.amountInvested).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-text-secondary">{r.round ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap">
                        {r.vestingStart
                          ? `${r.vestingStart}${r.vestingSchedule ? ` · ${r.vestingSchedule}` : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Subtotal row */}
                  <tr className="bg-surface-sunken/40 border-t border-border">
                    <td className="px-3 py-2 text-[10px] font-medium text-text-muted uppercase tracking-wider" colSpan={2}>Subtotal</td>
                    <td className="px-3 py-2 text-right font-mono text-sm text-text-primary font-medium tabular-nums">{totalShares.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm text-text-primary font-medium tabular-nums">{totalPercent.toFixed(2)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-mono text-sm text-text-primary font-medium tabular-nums">${totalInvested.toLocaleString()}</td>
                    <td className="px-3 py-2" colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
