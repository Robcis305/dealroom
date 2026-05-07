import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CapTableRowsView } from '@/components/workspace/CapTableRowsView';

const rows = [
  { id: 'r1', rowNumber: 2, holder: 'Alice', className: 'Common', instrument: 'common' as const, shares: 1000000, ownershipPercent: '40', pricePerShare: '0.0001', amountInvested: '100', round: null, roundValuation: null, vestingStart: null, vestingSchedule: null, certificateNumber: null, notes: null },
  { id: 'r2', rowNumber: 3, holder: 'Bob', className: 'Series A', instrument: 'preferred' as const, shares: 500000, ownershipPercent: '20', pricePerShare: '1', amountInvested: '500000', round: 'Series A', roundValuation: '5000000', vestingStart: null, vestingSchedule: null, certificateNumber: null, notes: null },
  { id: 'r3', rowNumber: 4, holder: 'Carol', className: 'ESOP', instrument: 'option' as const, shares: 100000, ownershipPercent: '5', pricePerShare: '0.5', amountInvested: '0', round: null, roundValuation: null, vestingStart: '2024-01-01', vestingSchedule: '4yr/1yr', certificateNumber: null, notes: null },
];

describe('CapTableRowsView', () => {
  it('renders rows grouped by instrument in canonical order', () => {
    render(<CapTableRowsView rows={rows} />);

    const groupHeadings = screen.getAllByRole('heading', { level: 3 });
    const groupTexts = groupHeadings.map((h) => h.textContent);

    // Common appears before Preferred, before Option
    const commonIdx = groupTexts.findIndex((t) => t?.toLowerCase().includes('common'));
    const preferredIdx = groupTexts.findIndex((t) => t?.toLowerCase().includes('preferred'));
    const optionIdx = groupTexts.findIndex((t) => t?.toLowerCase().includes('option'));

    expect(commonIdx).toBeLessThan(preferredIdx);
    expect(preferredIdx).toBeLessThan(optionIdx);
  });

  it('shows holder name for each row', () => {
    render(<CapTableRowsView rows={rows} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });
});
