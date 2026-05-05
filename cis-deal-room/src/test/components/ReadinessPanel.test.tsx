import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessPanel } from '@/components/workspace/ReadinessPanel';

const summary = {
  total: 48,
  ready: 12,
  byCategory: {
    corporate_legal: { total: 11, ready: 5 },
    financial: { total: 11, ready: 3 },
    commercial: { total: 9, ready: 2 },
    team_hr: { total: 7, ready: 1 },
    ip_technical: { total: 8, ready: 1 },
    operations_risk: { total: 2, ready: 0 },
  },
  dealKillerGroups: [
    { group: 'cap_table' as const, status: 'received' as const, color: 'green' as const, members: [] },
    { group: 'eighty_three_b' as const, status: 'blocked' as const, color: 'red' as const, members: [] },
    { group: 'customer_coc' as const, status: 'in_progress' as const, color: 'yellow' as const, members: [] },
    { group: 'ip_assignment' as const, status: 'not_started' as const, color: 'gray' as const, members: [] },
    { group: 'revenue_bridge' as const, status: 'received' as const, color: 'green' as const, members: [] },
  ],
};

describe('ReadinessPanel', () => {
  it('renders the score headline', () => {
    render(<ReadinessPanel summary={summary} onOpenChecklist={() => {}} onChipClick={() => {}} />);
    expect(screen.getByText(/12 \/ 48/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it('renders all 5 deal-killer chips', () => {
    render(<ReadinessPanel summary={summary} onOpenChecklist={() => {}} onChipClick={() => {}} />);
    expect(screen.getByText('Cap Table')).toBeInTheDocument();
    expect(screen.getByText('83(b) Filings')).toBeInTheDocument();
    expect(screen.getByText('Customer COC')).toBeInTheDocument();
    expect(screen.getByText('IP Assignments')).toBeInTheDocument();
    expect(screen.getByText('Revenue Bridge')).toBeInTheDocument();
  });
});
