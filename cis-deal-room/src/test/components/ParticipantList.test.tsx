import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParticipantList } from '@/components/workspace/ParticipantList';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

const rows = [
  {
    id: 'p1',
    userId: 'u1',
    email: 'client@x.com',
    firstName: null,
    lastName: null,
    role: 'client' as const,
    status: 'active',
    invitedAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    folderIds: [],
    lastSeen: new Date().toISOString(),
  },
  {
    id: 'p2',
    userId: 'u2',
    email: 'rep@x.com',
    firstName: null,
    lastName: null,
    role: 'seller_rep' as const,
    status: 'invited',
    invitedAt: new Date().toISOString(),
    activatedAt: null,
    folderIds: [],
    lastSeen: null,
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => rows,
  } as Response);
});

describe('ParticipantList', () => {
  it('renders rows with roleLabel applied to cisAdvisorySide', async () => {
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin={false}
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Seller Rep')).toBeInTheDocument();
  });

  it('hides Edit/Remove buttons for non-admin', async () => {
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin={false}
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('shows Edit/Remove buttons for admin', async () => {
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /remove/i }).length).toBeGreaterThan(0);
  });

  it('calls DELETE when Remove is clicked and confirmed', async () => {
    const confirmSpy = vi.spyOn(global, 'confirm').mockReturnValue(true);
    render(
      <ParticipantList
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={[]}
        isAdmin
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('client@x.com')).toBeInTheDocument());
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/participants/p1`),
        expect.objectContaining({ method: 'DELETE' })
      )
    );
    confirmSpy.mockRestore();
  });
});
