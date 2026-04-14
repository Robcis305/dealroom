import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParticipantFormModal } from '@/components/workspace/ParticipantFormModal';

const folders = [
  { id: 'f1', name: 'Financials' },
  { id: 'f2', name: 'Legal' },
];

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PARTICIPANT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('ParticipantFormModal — invite mode', () => {
  it('renders contextual Seller Rep option when CIS advises buyer', () => {
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
      />
    );
    expect(screen.getByRole('option', { name: 'Seller Rep' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Buyer Rep' })).not.toBeInTheDocument();
  });

  it('POSTs to /participants and calls onSuccess on 201', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'p1' }),
    } as Response);
    const onSuccess = vi.fn();
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={onSuccess}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
      />
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'client' } });
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/workspaces/${WORKSPACE_ID}/participants`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('surfaces server error message on 400', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Something bad' }),
    } as Response);
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
      />
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'client' } });
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() =>
      expect(screen.getByText(/something bad/i)).toBeInTheDocument()
    );
  });
});

describe('ParticipantFormModal — edit mode', () => {
  it('prefills the form with existing participant values', () => {
    render(
      <ParticipantFormModal
        mode="edit"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        existing={{
          id: PARTICIPANT_ID,
          email: 'exists@x.com',
          role: 'client',
          folderIds: ['f1'],
        }}
      />
    );
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe(
      'exists@x.com'
    );
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/role/i) as HTMLSelectElement).value).toBe('client');
    expect((screen.getByLabelText('Financials') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Legal') as HTMLInputElement).checked).toBe(false);
  });

  it('PATCHes to /participants/[pid] on save', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);
    const onSuccess = vi.fn();
    render(
      <ParticipantFormModal
        mode="edit"
        open
        onClose={() => {}}
        onSuccess={onSuccess}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        existing={{
          id: PARTICIPANT_ID,
          email: 'exists@x.com',
          role: 'client',
          folderIds: [],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/workspaces/${WORKSPACE_ID}/participants/${PARTICIPANT_ID}`,
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    expect(onSuccess).toHaveBeenCalled();
  });
});
