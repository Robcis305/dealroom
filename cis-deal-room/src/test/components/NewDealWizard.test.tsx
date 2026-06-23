import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewDealWizard } from '@/components/deals/NewDealWizard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

beforeEach(() => {
  vi.mocked(fetchWithAuth).mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'w1', cisAdvisorySide: 'seller_side' }),
  } as Response);
});

describe('NewDealWizard', () => {
  it('advances to the Folders step after filling Details and clicking Next', async () => {
    render(<NewDealWizard open onClose={() => {}} />);

    // Fill codename
    fireEvent.change(screen.getByLabelText(/deal codename/i), {
      target: { value: 'Project Falcon' },
    });
    // Fill client name
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: 'Acme Corp' },
    });
    // Select advisory side
    fireEvent.click(screen.getByRole('radio', { name: /seller-side/i }));

    // Click Next (primary action on Details step)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Should advance to Folders step
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument();
    });
  });

  it('shows Cancel (not Skip) on the Details step', () => {
    render(<NewDealWizard open onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
