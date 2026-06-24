import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock fetchWithAuth before importing the component
vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

// Modal uses lucide-react X icon; mock sonner if needed
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WelcomeModal } from '@/components/workspace/WelcomeModal';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

const WORKSPACE_ID = 'ws-abc-123';
const DEFAULT_PROPS = {
  workspaceId: WORKSPACE_ID,
  dealName: 'Acme Acquisition',
  roleLabel: 'Client',
  folders: ['Financials', 'Legal'],
  workstreams: ['Due Diligence'],
  onDismiss: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 200 }));
});

describe('WelcomeModal — rendering', () => {
  it('renders the deal name as heading', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Welcome to Acme Acquisition/i)).toBeInTheDocument();
  });

  it('renders the roleLabel', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Client/i)).toBeInTheDocument();
  });

  it('renders folder names', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  it('renders workstream names', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('Due Diligence')).toBeInTheDocument();
  });

  it('shows "No folders yet." when folders is empty', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} folders={[]} />);
    expect(screen.getByText('No folders yet.')).toBeInTheDocument();
  });

  it('shows "No workstreams yet." when workstreams is empty', () => {
    render(<WelcomeModal {...DEFAULT_PROPS} workstreams={[]} />);
    expect(screen.getByText('No workstreams yet.')).toBeInTheDocument();
  });
});

describe('WelcomeModal — Enter deal room button', () => {
  it('POSTs to /api/workspaces/:id/onboarded on click and calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<WelcomeModal {...DEFAULT_PROPS} onDismiss={onDismiss} />);

    const btn = screen.getByRole('button', { name: /enter deal room/i });
    fireEvent.click(btn);

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    expect(fetchWithAuth).toHaveBeenCalledWith(
      `/api/workspaces/${WORKSPACE_ID}/onboarded`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows a busy state while the POST is pending', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetchWithAuth).mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );

    const onDismiss = vi.fn();
    render(<WelcomeModal {...DEFAULT_PROPS} onDismiss={onDismiss} />);

    const btn = screen.getByRole('button', { name: /enter deal room/i });
    fireEvent.click(btn);

    // Button should be disabled while pending
    await waitFor(() => expect(btn).toBeDisabled());

    // Resolve the fetch
    resolveFetch(new Response(null, { status: 200 }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
  });
});
