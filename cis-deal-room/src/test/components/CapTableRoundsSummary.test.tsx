import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapTableRoundsSummary } from '@/components/workspace/CapTableRoundsSummary';

const rows = [
  // Founders pre-financing — no Round
  { round: null, roundValuation: null, shares: 10000000, amountInvested: '1000', instrument: 'common' as const },
  // Series A — 2 holders
  { round: 'Series A', roundValuation: '5000000', shares: 1000000, amountInvested: '500000', instrument: 'preferred' as const },
  { round: 'Series A', roundValuation: '5000000', shares: 500000, amountInvested: '250000', instrument: 'preferred' as const },
  // ESOP grants — Round = "ESOP" but no valuation
  { round: 'ESOP', roundValuation: null, shares: 200000, amountInvested: '0', instrument: 'option' as const },
];

describe('CapTableRoundsSummary', () => {
  it('renders a row per unique Round, plus "Pre-financing / Grants" for null rounds', () => {
    render(<CapTableRoundsSummary rows={rows} />);
    expect(screen.getByText('Pre-financing / Grants')).toBeInTheDocument();
    expect(screen.getByText('Series A')).toBeInTheDocument();
    expect(screen.getByText('ESOP')).toBeInTheDocument();
  });

  it('aggregates total invested per round', () => {
    render(<CapTableRoundsSummary rows={rows} />);
    // Series A total: 500000 + 250000 = 750000
    expect(screen.getByText(/\$750,000/)).toBeInTheDocument();
  });

  it('shows valuation when present, dash when not', () => {
    render(<CapTableRoundsSummary rows={rows} />);
    expect(screen.getByText(/\$5,000,000/)).toBeInTheDocument();
  });
});
