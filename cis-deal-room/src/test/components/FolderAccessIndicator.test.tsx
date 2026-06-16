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
        refreshToken={0}
        onClick={() => {}}
      />
    );
    // admin (implicit) + client (granted) = 2; rep is granted folder-2, excluded
    await waitFor(() => expect(screen.getByText('User access')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onClick when the access button is pressed', async () => {
    const onClick = vi.fn();
    render(
      <FolderAccessIndicator
        workspaceId={WORKSPACE_ID}
        folderId="folder-1"
        refreshToken={0}
        onClick={onClick}
      />
    );
    await waitFor(() => expect(screen.getByText('User access')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /user access/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
