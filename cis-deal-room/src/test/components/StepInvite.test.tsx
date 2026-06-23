import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepInvite } from '@/components/deals/wizard/StepInvite';
import { NewDealWizard } from '@/components/deals/NewDealWizard';

// Shared push mock captured at module scope so wizard tests can assert on it
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const FOLDERS = [{ id: 'f1', name: 'Legal' }];

// ─── StepInvite unit tests ────────────────────────────────────────────────────

describe('StepInvite', () => {
  let commitFn: (() => Promise<boolean>) | null = null;
  let onDone: ReturnType<typeof vi.fn>;

  function renderInvite() {
    onDone = vi.fn();
    commitFn = null;

    render(
      <StepInvite
        workspaceId="w1"
        cisAdvisorySide="seller_side"
        folders={FOLDERS}
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        onDone={onDone as unknown as () => void}
        registerCommit={(fn) => {
          commitFn = fn;
        }}
      />
    );
  }

  beforeEach(() => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1' }),
    } as Response);
    pushMock.mockClear();
  });

  it('renders Invite team heading', () => {
    renderInvite();
    expect(screen.getByRole('heading', { name: /invite team/i })).toBeInTheDocument();
  });

  it('shows folder access checkboxes including All folders', () => {
    renderInvite();
    expect(screen.getByRole('checkbox', { name: /all folders/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /legal/i })).toBeInTheDocument();
  });

  it('shows folder hint when non-admin/non-cis_team role has no folders selected', () => {
    renderInvite();
    // Change to 'client' to trigger hint (default admin doesn't show hint)
    fireEvent.change(screen.getByRole('combobox', { name: /role 1/i }), {
      target: { value: 'client' },
    });
    expect(
      screen.getByText(/they won't see documents until granted folder access/i)
    ).toBeInTheDocument();
  });

  it('does NOT show folder hint when All folders is checked', () => {
    renderInvite();
    fireEvent.change(screen.getByRole('combobox', { name: /role 1/i }), {
      target: { value: 'client' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /all folders/i }));
    expect(
      screen.queryByText(/they won't see documents until granted folder access/i)
    ).not.toBeInTheDocument();
  });

  it('All folders checkbox toggles all folder ids on/off', () => {
    renderInvite();
    const allFolders = screen.getByRole('checkbox', { name: /all folders/i });
    const legalCheckbox = screen.getByRole('checkbox', { name: /^legal$/i });

    expect(legalCheckbox).not.toBeChecked();
    fireEvent.click(allFolders);
    expect(legalCheckbox).toBeChecked();
    fireEvent.click(allFolders);
    expect(legalCheckbox).not.toBeChecked();
  });

  it('with empty email, commit returns true with NO POST', async () => {
    renderInvite();
    await waitFor(() => expect(commitFn).not.toBeNull());

    const result = await commitFn!();
    expect(result).toBe(true);
    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('POSTs with correct body and calls onDone on success', async () => {
    renderInvite();
    await waitFor(() => expect(commitFn).not.toBeNull());

    // Type email
    fireEvent.change(screen.getByRole('textbox', { name: /email address 1/i }), {
      target: { value: 'alice@example.com' },
    });

    // Change role to client
    fireEvent.change(screen.getByRole('combobox', { name: /role 1/i }), {
      target: { value: 'client' },
    });

    // Select Legal folder
    fireEvent.click(screen.getByRole('checkbox', { name: /^legal$/i }));

    // Wait for commitFn to re-register after state change
    await waitFor(() => expect(commitFn).not.toBeNull());

    const result = await commitFn!();

    expect(result).toBe(true);
    expect(fetchWithAuth).toHaveBeenCalledOnce();

    const [url, opts] = vi.mocked(fetchWithAuth).mock.calls[0];
    expect(url).toBe('/api/workspaces/w1/participants');
    expect(opts?.method).toBe('POST');

    const body = JSON.parse(opts?.body as string) as {
      email: string;
      role: string;
      folderIds: string[];
    };
    expect(body.email).toBe('alice@example.com');
    expect(body.role).toBe('client');
    expect(body.folderIds).toContain('f1');

    expect(onDone).toHaveBeenCalled();
  });

  it('shows inline error on 409 and returns false', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Outstanding deal-killers exist' }),
    } as Response);

    renderInvite();
    await waitFor(() => expect(commitFn).not.toBeNull());

    fireEvent.change(screen.getByRole('textbox', { name: /email address 1/i }), {
      target: { value: 'counterparty@example.com' },
    });

    await waitFor(() => expect(commitFn).not.toBeNull());

    const result = await commitFn!();

    expect(result).toBe(false);
    expect(onDone).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(/outstanding deal-killers exist/i)).toBeInTheDocument();
    });
  });

  it('can add and remove rows', () => {
    renderInvite();
    fireEvent.click(screen.getByRole('button', { name: /add another person/i }));
    expect(screen.getAllByRole('textbox', { name: /email address/i })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /remove row 1/i }));
    expect(screen.getAllByRole('textbox', { name: /email address/i })).toHaveLength(1);
  });
});

// ─── NewDealWizard — Invite step integration ─────────────────────────────────

describe('NewDealWizard — Invite step integration', () => {
  async function advanceToInvite() {
    // Mock: Details POST returns workspace
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'w1', cisAdvisorySide: 'seller_side' }),
    } as Response);

    render(<NewDealWizard open onClose={() => {}} />);

    // Fill Details
    fireEvent.change(screen.getByLabelText(/deal codename/i), {
      target: { value: 'Project Falcon' },
    });
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /seller-side/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /folders/i })).toBeInTheDocument()
    );

    // Mock: Folder POST (8 canonical folders)
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'f1', name: 'Financials' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /workstreams/i })).toBeInTheDocument()
    );

    // Skip workstreams
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /invite team/i })).toBeInTheDocument()
    );
  }

  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(fetchWithAuth).mockReset();
  });

  it('Skip on Invite step navigates to workspace without POSTing participants', async () => {
    await advanceToInvite();

    // Confirm no participants POST has been made yet
    const participantCalls = vi.mocked(fetchWithAuth).mock.calls.filter(
      ([url]) => typeof url === 'string' && (url as string).includes('/participants')
    );
    expect(participantCalls).toHaveLength(0);

    // Click Skip
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    expect(pushMock).toHaveBeenCalledWith('/workspace/w1');

    // Still no participants POST after Skip
    const participantCallsAfter = vi.mocked(fetchWithAuth).mock.calls.filter(
      ([url]) => typeof url === 'string' && (url as string).includes('/participants')
    );
    expect(participantCallsAfter).toHaveLength(0);
  });

  it('Finish with an email+role+folder POSTs participant and navigates', async () => {
    await advanceToInvite();

    // Mock participants POST success
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1' }),
    } as Response);

    // Fill in invite row — email input
    const emailInput = screen.getByRole('textbox', { name: /email address 1/i });
    fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });

    // Click Finish
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/workspace/w1');
    });

    // Verify POST was made with correct body
    const [url, opts] = vi.mocked(fetchWithAuth).mock.calls.find(
      ([u]) => typeof u === 'string' && (u as string).includes('/participants')
    )!;
    expect(url).toContain('/api/workspaces/w1/participants');
    const body = JSON.parse(opts!.body as string) as { email: string };
    expect(body.email).toBe('bob@example.com');
  });
});
