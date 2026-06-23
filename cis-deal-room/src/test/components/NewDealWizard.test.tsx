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

describe('NewDealWizard — Workstreams step', () => {
  async function advanceToWorkstreams() {
    render(<NewDealWizard open onClose={() => {}} />);

    // Fill Details
    fireEvent.change(screen.getByLabelText(/deal codename/i), {
      target: { value: 'Project Falcon' },
    });
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /seller-side/i }));

    // Next on Details — creates workspace, mocked to return { id: 'w1', cisAdvisorySide: 'seller_side' }
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument());

    // Mock folder POST for Folders step (returns { id: 'f1', name: 'Financials' })
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'f1', name: 'Financials' }),
    } as Response);

    // Next on Folders — commits folders then advances
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /workstreams/i })).toBeInTheDocument());
  }

  it('renders 5 workstreams with none checked', async () => {
    await advanceToWorkstreams();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(5);
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it('Next with none checked calls no workstream POSTs and advances', async () => {
    await advanceToWorkstreams();

    const postCalls: string[] = [];
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/workstreams')) {
        postCalls.push(url);
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /invite/i })).toBeInTheDocument();
    });
    expect(postCalls).toHaveLength(0);
  });

  it('Skip advances without any workstream POSTs', async () => {
    await advanceToWorkstreams();

    const postCalls: string[] = [];
    vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/workstreams')) {
        postCalls.push(url as string);
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /invite/i })).toBeInTheDocument();
    });
    expect(postCalls).toHaveLength(0);
  });

  it('checks 2 workstreams and Next POSTs exactly those two keys', async () => {
    await advanceToWorkstreams();

    const postedKeys: string[] = [];
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/workstreams') && opts?.method === 'POST') {
        const body = JSON.parse(opts.body as string) as { key: string };
        postedKeys.push(body.key);
        return {
          ok: true,
          json: async () => ({ workstream: { key: body.key } }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    // Check Legal and Finance
    fireEvent.click(screen.getByRole('checkbox', { name: /legal/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /finance/i }));

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /invite/i })).toBeInTheDocument();
    });
    expect(postedKeys).toHaveLength(2);
    expect(postedKeys).toContain('legal');
    expect(postedKeys).toContain('finance');
  });
});
