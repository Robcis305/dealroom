'use client';

interface RoundRow {
  round: string | null;
  roundValuation: string | null;
  shares: number;
  amountInvested: string;
  instrument: string;
}

interface Props {
  rows: RoundRow[];
}

const PRE_FINANCING_LABEL = 'Pre-financing / Grants';

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function CapTableRoundsSummary({ rows }: Props) {
  const buckets = new Map<string, { invested: number; shares: number; valuation: string | null }>();

  for (const r of rows) {
    const key = r.round ?? PRE_FINANCING_LABEL;
    const existing = buckets.get(key) ?? { invested: 0, shares: 0, valuation: null };
    existing.invested += Number(r.amountInvested);
    existing.shares += r.shares;
    if (r.roundValuation && !existing.valuation) {
      existing.valuation = r.roundValuation;
    }
    buckets.set(key, existing);
  }

  const entries = Array.from(buckets.entries()).sort(([a], [b]) => {
    // Pre-financing always last
    if (a === PRE_FINANCING_LABEL) return 1;
    if (b === PRE_FINANCING_LABEL) return -1;
    return a.localeCompare(b);
  });

  return (
    <section className="mb-8">
      <div className="text-[10px] font-medium text-text-muted uppercase tracking-widest mb-3">
        Rounds Summary
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {entries.map(([roundName, data]) => (
          <div
            key={roundName}
            className="bg-surface border border-border rounded-xl p-4 hover:border-border/80 transition-colors duration-150"
          >
            <div className="text-sm font-medium text-text-primary mb-3">
              {roundName}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Invested</span>
                <span className="font-mono text-sm text-text-secondary">{formatUsd(data.invested)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Shares</span>
                <span className="font-mono text-sm text-text-secondary">{data.shares.toLocaleString()}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Valuation</span>
                {data.valuation ? (
                  <span className="font-mono text-sm text-text-primary font-medium">{formatUsd(Number(data.valuation))}</span>
                ) : (
                  <span className="font-mono text-sm text-text-muted">—</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
