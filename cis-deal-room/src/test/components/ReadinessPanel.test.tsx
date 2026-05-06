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
  byStage: {
    1: { total: 11, ready: 5, label: 'Cap & Corp', dayRange: 'Day 1-3' },
    2: { total: 11, ready: 3, label: 'Financial', dayRange: 'Day 3-10' },
    3: { total: 9, ready: 2, label: 'Commercial', dayRange: 'Day 10-15' },
    4: { total: 17, ready: 2, label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
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
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText(/12 \/ 48/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it('renders all 5 deal-killer chips', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getByText('Cap Table')).toBeInTheDocument();
    expect(screen.getByText('83(b) Filings')).toBeInTheDocument();
    expect(screen.getByText('Customer COC')).toBeInTheDocument();
    expect(screen.getByText('IP Assignments')).toBeInTheDocument();
    expect(screen.getByText('Revenue Bridge')).toBeInTheDocument();
  });

  it('renders 4 stage rows with labels and day ranges', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    // Use getAllByText for items appearing in both desktop and mobile views.
    expect(screen.getAllByText('Cap & Corp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Day 1-3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Financial').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Day 3-10').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Commercial').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Day 10-15').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Legal · IP · HR · Ops').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Day 15-21').length).toBeGreaterThanOrEqual(1);
  });

  it('shows count text for each stage bar', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    expect(screen.getAllByText('5/11').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3/11').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2/17').length).toBeGreaterThanOrEqual(1);
  });

  it('fires onStageClick with the stage number when a stage row is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    let clicked: number | null = null;
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={(stage) => { clicked = stage; }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /stage 1/i }));
    expect(clicked).toBe(1);
  });

  it('does NOT render category bars (those moved to checklist tab)', () => {
    render(
      <ReadinessPanel
        summary={summary}
        onOpenChecklist={() => {}}
        onChipClick={() => {}}
        onStageClick={() => {}}
      />,
    );
    // The OLD short category labels should not appear (Corporate, IP/Tech, Ops).
    expect(screen.queryByText('Corporate')).not.toBeInTheDocument();
    expect(screen.queryByText('IP/Tech')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops')).not.toBeInTheDocument();
  });
});
