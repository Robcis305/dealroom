import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderAccessIndicator } from '@/components/workspace/FolderAccessIndicator';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

const rows = [
  { id: 'admin1', email: 'admin@cis.com', firstName: 'Adam', lastName: 'Min',
    role: 'admin' as const, status: 'active', folderIds: [] },
  { id: 'p1', email: 'client@x.com', firstName: null, lastName: null,
    role: 'client' as const, status: 'active', folderIds: ['folder-1'] },
  { id: 'p2', email: 'rep@x.com', firstName: null, lastName: null,
    role: 'seller_rep' as const, status: 'invited', folderIds: ['folder-2'] },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => rows,
  } as Response);
});

describe('FolderAccessIndicator', () => {
  it('counts admins (implicit) + explicitly granted participants for the open folder', async () => {
    render(
      <FolderAccessIndicator
        workspaceId={WORKSPACE_ID}
        folderId="folder-1"
        cisAdvisorySide="buyer_side"
        refreshToken={0}
      />
    );
    // admin (implicit) + client (granted) = 2; rep is granted folder-2, excluded
    await waitFor(() => expect(screen.getByText('2 with access')).toBeInTheDocument());
  });

  it('opens a popover listing participants, marking admins as Full access', async () => {
    render(
      <FolderAccessIndicator
        workspaceId={WORKSPACE_ID}
        folderId="folder-1"
        cisAdvisorySide="buyer_side"
        refreshToken={0}
      />
    );
    await waitFor(() => expect(screen.getByText('2 with access')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /users with access to this folder/i }));
    expect(screen.getByText('Adam Min')).toBeInTheDocument();
    expect(screen.getByText('client@x.com')).toBeInTheDocument();
    expect(screen.getByText('Full access')).toBeInTheDocument();
    expect(screen.queryByText('rep@x.com')).not.toBeInTheDocument();
  });
});
