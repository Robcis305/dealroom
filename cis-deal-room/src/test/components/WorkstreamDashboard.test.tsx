import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkstreamDashboard } from '@/components/workspace/WorkstreamDashboard';

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
});
