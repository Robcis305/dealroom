import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParticipantFormModal } from '@/components/workspace/ParticipantFormModal';

const folders = [
  { id: 'f1', name: 'Financials' },
  { id: 'f2', name: 'Legal Docs' },
];

const workstreams = [
  { id: 'ws1', name: 'Legal WS' },
  { id: 'ws2', name: 'Finance WS' },
];

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PARTICIPANT_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('ParticipantFormModal — invite mode', () => {
  it('renders new active role options (Counterparty, Client Counsel) and no legacy Rep options', () => {
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        workstreams={[]}
      />
    );
    expect(screen.getByRole('option', { name: 'Counterparty' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Client Counsel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'View-only' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Seller Rep' })).not.toBeInTheDocument();
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
        workstreams={[]}
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
        workstreams={[]}
      />
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'client' } });
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() =>
      expect(screen.getByText(/something bad/i)).toBeInTheDocument()
    );
  });

  it('allows view_only invite to submit without selecting a shadow side', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'p2' }),
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
        workstreams={[]}
      />
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'viewer@y.com' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'view_only' } });
    // No shadow-side picker should appear
    expect(screen.queryByLabelText(/view as/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/workspaces/${WORKSPACE_ID}/participants`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('renders workstream checkboxes when workstreams prop is provided', () => {
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        workstreams={workstreams}
      />
    );
    expect(screen.getByText('Workstream access')).toBeInTheDocument();
    expect(screen.getByLabelText('Legal WS')).toBeInTheDocument();
    expect(screen.getByLabelText('Finance WS')).toBeInTheDocument();
  });

  it('includes selected workstreamIds in POST body on invite', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return { ok: true, status: 201, json: async () => ({ id: 'p3' }) } as Response;
    });
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
        workstreams={workstreams}
      />
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ws@y.com' } });
    // Select the ws1 workstream checkbox (labelled 'Legal WS' in workstreams)
    const wsCheckbox = screen.getByLabelText('Legal WS');
    fireEvent.click(wsCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.workstreamIds).toEqual(['ws1']);
  });

  it('hides workstream section when workstreams prop is empty', () => {
    render(
      <ParticipantFormModal
        mode="invite"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        workstreams={[]}
      />
    );
    expect(screen.queryByText('Workstream access')).not.toBeInTheDocument();
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
        workstreams={[]}
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
    expect((screen.getByLabelText('Legal Docs') as HTMLInputElement).checked).toBe(false);
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
        workstreams={[]}
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

  it('pre-checks workstreams from existing.workstreamIds in edit mode', () => {
    render(
      <ParticipantFormModal
        mode="edit"
        open
        onClose={() => {}}
        onSuccess={() => {}}
        workspaceId={WORKSPACE_ID}
        cisAdvisorySide="buyer_side"
        folders={folders}
        workstreams={workstreams}
        existing={{
          id: PARTICIPANT_ID,
          email: 'exists@x.com',
          role: 'client',
          folderIds: [],
          workstreamIds: ['ws1'],
        }}
      />
    );
    // ws1 is 'Legal WS' in our workstreams fixture — should be pre-checked
    expect((screen.getByLabelText('Legal WS') as HTMLInputElement).checked).toBe(true);
    // ws2 is 'Finance WS' — not in workstreamIds, should be unchecked
    expect((screen.getByLabelText('Finance WS') as HTMLInputElement).checked).toBe(false);
  });

  it('includes workstreamIds in PATCH body on edit save', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    });
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
        workstreams={workstreams}
        existing={{
          id: PARTICIPANT_ID,
          email: 'exists@x.com',
          role: 'client',
          folderIds: [],
          workstreamIds: ['ws1'],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.workstreamIds).toEqual(['ws1']);
  });
});
