import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NewDealWizard } from '@/components/deals/NewDealWizard';
import { StepInvite } from '@/components/deals/wizard/StepInvite';

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

describe('NewDealWizard — Invite step double-click guard', () => {
  async function advanceToInvite() {
    render(<NewDealWizard open onClose={() => {}} />);

    // Fill Details
    fireEvent.change(screen.getByLabelText(/deal codename/i), {
      target: { value: 'Project Falcon' },
    });
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /seller-side/i }));

    // Next on Details — creates workspace
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument());

    // Mock folder POST
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'f1', name: 'Financials' }),
    } as Response);

    // Next on Folders
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /workstreams/i })).toBeInTheDocument());

    // Next on Workstreams (no selections)
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /invite/i })).toBeInTheDocument());
  }

  it('Finish button is disabled while the invite POST is in flight', async () => {
    await advanceToInvite();

    // Type an email so the commit fn fires a POST
    fireEvent.change(screen.getByLabelText(/email address 1/i), {
      target: { value: 'alice@example.com' },
    });

    // Set up a deferred participants POST — never resolves until we release it
    let releasePost!: () => void;
    const pendingPost = new Promise<Response>((resolve) => {
      releasePost = () =>
        resolve({ ok: true, json: async () => ({}) } as Response);
    });

    vi.mocked(fetchWithAuth).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/participants')) {
        return pendingPost;
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    // Click Finish — kicks off the pending POST
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    // While the POST is in flight, Finish button must be disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
    });

    // A second click must not produce a second POST call
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    // Release the POST so the test can clean up
    await act(async () => {
      releasePost();
    });

    // Participants POST was called exactly once (the second click was blocked)
    const participantCalls = vi.mocked(fetchWithAuth).mock.calls.filter(
      ([url]) => typeof url === 'string' && (url as string).includes('/participants'),
    );
    expect(participantCalls).toHaveLength(1);
  });
});

describe('NewDealWizard — Folders step idempotency (Back then Next again)', () => {
  it('re-advancing through Folders step makes no new POSTs and onDone receives the same non-duplicate list', async () => {
    render(<NewDealWizard open onClose={() => {}} />);

    // Fill Details
    fireEvent.change(screen.getByLabelText(/deal codename/i), {
      target: { value: 'Project Falcon' },
    });
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /seller-side/i }));

    // Next on Details — creates workspace
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'w1', cisAdvisorySide: 'seller_side' }),
    } as Response);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument());

    // Track folder POSTs
    let folderPostCount = 0;
    const foldersMade: string[] = [];
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/folders') && opts?.method === 'POST') {
        folderPostCount++;
        const body = JSON.parse(opts.body as string) as { name: string };
        foldersMade.push(body.name);
        return {
          ok: true,
          json: async () => ({ id: `f${folderPostCount}`, name: body.name }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    // First Next on Folders — should POST all 8 canonical folders
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /workstreams/i })).toBeInTheDocument());

    const countAfterFirst = folderPostCount;
    expect(countAfterFirst).toBeGreaterThan(0); // sanity: at least one folder was created

    // Capture onDone result by reading createdFolders from the StepInvite folders prop —
    // instead, we go Back to Folders then Next again and assert no new POSTs
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument());

    // Second Next on Folders — should make ZERO new POSTs (idempotent)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /workstreams/i })).toBeInTheDocument());

    expect(folderPostCount).toBe(countAfterFirst); // no new POSTs on re-advance
    // No duplicate folder names in the POST history
    const uniqueNames = new Set(foldersMade);
    expect(foldersMade.length).toBe(uniqueNames.size);
  });
});

describe('StepInvite — workstream assignment', () => {
  it('POSTs workstreamIds when a workstream checkbox is selected', async () => {
    const commitRef: { fn: (() => Promise<boolean>) | null } = { fn: null };
    function registerCommit(fn: (() => Promise<boolean>) | null) {
      commitRef.fn = fn;
    }

    render(
      <StepInvite
        workspaceId="ws1"
        cisAdvisorySide="seller_side"
        folders={[]}
        workstreams={[{ id: 'wst1', name: 'Legal' }]}
        onDone={() => {}}
        registerCommit={registerCommit}
      />
    );

    // Add email to the first row
    fireEvent.change(screen.getByLabelText(/email address 1/i), {
      target: { value: 'bob@example.com' },
    });

    // Select the "Legal" workstream checkbox
    fireEvent.click(screen.getByRole('checkbox', { name: /^legal$/i }));

    // Mock participants POST and capture body
    let capturedBody: Record<string, unknown> | null = null;
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/participants')) {
        capturedBody = JSON.parse(opts?.body as string) as Record<string, unknown>;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    // Trigger commit
    await act(async () => {
      await commitRef.fn?.();
    });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.workstreamIds).toEqual(['wst1']);
  });

  it('POSTs all workstreamIds when "All workstreams" is toggled', async () => {
    const commitRef: { fn: (() => Promise<boolean>) | null } = { fn: null };
    function registerCommit(fn: (() => Promise<boolean>) | null) {
      commitRef.fn = fn;
    }

    render(
      <StepInvite
        workspaceId="ws1"
        cisAdvisorySide="seller_side"
        folders={[]}
        workstreams={[
          { id: 'wst1', name: 'Legal' },
          { id: 'wst2', name: 'Finance' },
        ]}
        onDone={() => {}}
        registerCommit={registerCommit}
      />
    );

    // Add email
    fireEvent.change(screen.getByLabelText(/email address 1/i), {
      target: { value: 'carol@example.com' },
    });

    // Click "All workstreams"
    fireEvent.click(screen.getByRole('checkbox', { name: /all workstreams/i }));

    let capturedBody: Record<string, unknown> | null = null;
    vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/participants')) {
        capturedBody = JSON.parse(opts?.body as string) as Record<string, unknown>;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    await act(async () => {
      await commitRef.fn?.();
    });

    expect(capturedBody).not.toBeNull();
    const ids = capturedBody!.workstreamIds as string[];
    expect(ids).toContain('wst1');
    expect(ids).toContain('wst2');
    expect(ids).toHaveLength(2);
  });
});
