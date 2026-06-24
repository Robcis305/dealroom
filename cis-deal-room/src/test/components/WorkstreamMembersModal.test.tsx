import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WorkstreamMembersModal } from '@/components/workspace/WorkstreamMembersModal';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const WORKSTREAM_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

const participants = [
  { id: 'p-active', firstName: 'Alice', lastName: null, email: 'alice@x.com', role: 'client', status: 'active' },
  { id: 'p-invited', firstName: 'Bob', lastName: null, email: 'bob@x.com', role: 'client', status: 'invited' },
  { id: 'p-view', firstName: 'Carol', lastName: null, email: 'carol@x.com', role: 'view_only', status: 'active' },
  { id: 'p-admin', firstName: 'Dave', lastName: null, email: 'dave@x.com', role: 'admin', status: 'active' },
];

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string | Request | URL) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('/members')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ members: [] }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => participants,
    } as Response);
  });
});

describe('WorkstreamMembersModal — active-only filter', () => {
  it('shows active AND invited non-view-only participants; excludes only view-only', async () => {
    render(
      <WorkstreamMembersModal
        workspaceId={WORKSPACE_ID}
        workstreamId={WORKSTREAM_ID}
        workstreamName="Legal"
        onClose={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    // active client — shown
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // active admin — shown
    expect(screen.getByText('Dave')).toBeInTheDocument();
    // invited (not yet accepted) — now shown (rendered as first name since firstName is set)
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // view_only — still excluded
    expect(screen.queryByText('carol@x.com')).not.toBeInTheDocument();
  });

  it('shows excluded count note when some participants are filtered out', async () => {
    render(
      <WorkstreamMembersModal
        workspaceId={WORKSPACE_ID}
        workstreamId={WORKSTREAM_ID}
        workstreamName="Legal"
        onClose={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    // only 1 excluded now (carol view_only); invited Bob is shown
    expect(screen.getByText(/1 view-only participant/i)).toBeInTheDocument();
  });

  it('shows "No participants to add" when all are view-only (excluded)', async () => {
    vi.mocked(global.fetch).mockImplementation((url: string | Request | URL) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('/members')) {
        return Promise.resolve({ ok: true, json: async () => ({ members: [] }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 'p1', firstName: null, lastName: null, email: 'v@x.com', role: 'view_only', status: 'active' },
          { id: 'p2', firstName: null, lastName: null, email: 'v2@x.com', role: 'view_only', status: 'active' },
        ],
      } as Response);
    });

    render(
      <WorkstreamMembersModal
        workspaceId={WORKSPACE_ID}
        workstreamId={WORKSTREAM_ID}
        workstreamName="Legal"
        onClose={() => {}}
        onChanged={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText('No participants to add.')).toBeInTheDocument());
  });
});

describe('WorkstreamMembersModal — staged save', () => {
  it('makes no member POST until Save, then POSTs the checked member and toasts success', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    global.fetch = vi.fn().mockImplementation((url: string | Request | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      calls.push({ url: urlStr, method: init?.method, body: init?.body as string | undefined });
      if (urlStr.includes('/members')) return Promise.resolve({ ok: true, json: async () => ({ members: [] }) } as Response);
      return Promise.resolve({ ok: true, json: async () => participants } as Response);
    });

    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(
      <WorkstreamMembersModal
        workspaceId={WORKSPACE_ID}
        workstreamId={WORKSTREAM_ID}
        workstreamName="Legal"
        onClose={onClose}
        onChanged={onChanged}
      />
    );

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    // Save is disabled with no changes; clicking the checkbox does NOT POST.
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByText('Alice'));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(save).toBeEnabled();

    // Save applies the add.
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = calls.find((c) => c.url.includes('/members') && c.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post!.body!)).toEqual({ participantId: 'p-active' });
    expect(onChanged).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/updated/i));
  });
});
