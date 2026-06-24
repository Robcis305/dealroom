import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WorkstreamDashboard } from '@/components/workspace/WorkstreamDashboard';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      workstream: { id: 'w-legal', name: 'Legal', description: 'Contracts', color: '#33322F', tileTint: '#ECEBE6', docCount: 31, memberCount: 6, openQaCount: 0, overdueCount: 0 },
      members: [],
      recentActivity: [],
    }),
  }),
}));

describe('WorkstreamDashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the workstream name and stat figures', async () => {
    render(<WorkstreamDashboard workspaceId="ws-1" workstreamId="w-legal" onClearLens={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Legal' })).toBeInTheDocument());
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('shows "Manage members" button when canManage=true and onManageMembers is provided', async () => {
    render(
      <WorkstreamDashboard
        workspaceId="ws-1"
        workstreamId="w-legal"
        canManage
        onClearLens={() => {}}
        onManageMembers={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('Manage members')).toBeInTheDocument());
  });

  it('does NOT show "Manage members" button when canManage=false', async () => {
    render(
      <WorkstreamDashboard
        workspaceId="ws-1"
        workstreamId="w-legal"
        canManage={false}
        onClearLens={() => {}}
        onManageMembers={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Legal' })).toBeInTheDocument());
    expect(screen.queryByText('Manage members')).not.toBeInTheDocument();
  });

  it('reveals the member list when the Members card is clicked', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true,
      json: async () => ({
        workstream: { id: 'w-legal', name: 'Legal', description: 'Contracts', color: '#33322F', tileTint: '#ECEBE6', docCount: 0, memberCount: 1, openQaCount: 0, overdueCount: 0 },
        members: [{ participantId: 'p1', firstName: 'Alice', lastName: null, email: 'alice@x.com', role: 'client' }],
        recentActivity: [],
      }),
    } as unknown as Response);

    render(<WorkstreamDashboard workspaceId="ws-1" workstreamId="w-legal" onClearLens={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Legal' })).toBeInTheDocument());

    // Member hidden until the card is clicked.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /members/i }));
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });
});
