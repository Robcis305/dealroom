import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getOutstandingMock, inviteMock, logActivityMock } = vi.hoisted(() => ({
  getOutstandingMock: vi.fn(),
  inviteMock: vi.fn(),
  logActivityMock: vi.fn(),
}));

vi.mock('@/db', () => ({ db: {} }));

vi.mock('@/lib/dal/index', () => ({
  verifySession: vi.fn().mockResolvedValue({
    userId: 'admin', userEmail: 'a@x', isAdmin: true,
  }),
}));

vi.mock('@/lib/dal/playbook', () => ({
  getOutstandingDealKillerGroups: getOutstandingMock,
  shouldShowCanonicalPlaybook: vi.fn((ws: { cisAdvisorySide?: string }) =>
    ws.cisAdvisorySide !== 'buyer_side',
  ),
}));

vi.mock('@/lib/dal/checklist', () => ({
  getChecklistForWorkspace: vi.fn().mockResolvedValue({ id: 'cl-1' }),
}));

vi.mock('@/lib/dal/access', () => ({
  requireDealAccess: vi.fn().mockResolvedValue({ workspace: { cisAdvisorySide: 'seller_side' } }),
}));

vi.mock('@/lib/dal/participants', () => ({
  inviteParticipant: inviteMock,
  getParticipants: vi.fn(),
}));

vi.mock('@/lib/dal/workspaces', () => ({
  getWorkspace: vi.fn().mockResolvedValue({ id: 'ws', name: 'Deal', cisAdvisorySide: 'seller_side' }),
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email/invitation', () => ({ InvitationEmail: vi.fn() }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://test' }));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: logActivityMock,
}));

import { POST } from '@/app/api/workspaces/[id]/participants/route';
import { getWorkspace } from '@/lib/dal/workspaces';

function makeReq(body: unknown): Request {
  return new Request('http://test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /participants — counterparty invite gate (seller_side advisory)', () => {
  beforeEach(() => {
    inviteMock.mockReset();
    inviteMock.mockResolvedValue({
      participant: { id: 'p1' },
      rawToken: 't',
    });
    logActivityMock.mockReset();
    getOutstandingMock.mockReset();
  });

  it('blocks counterparty invite with outstanding deal-killers and no ack', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'b@x.com', role: 'counterparty', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.outstanding).toHaveLength(1);
    expect(json.outstanding[0].group).toBe('cap_table');
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('allows counterparty invite with outstanding deal-killers when ack matches', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({
        email: 'b@x.com',
        role: 'counterparty',
        folderIds: [],
        acknowledgement: 'share anyway',
      }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
    expect(logActivityMock).toHaveBeenCalled();
  });

  it('rejects deprecated role seller_rep with 400', async () => {
    const res = await POST(
      makeReq({ email: 's@x.com', role: 'seller_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(400);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('rejects deprecated role buyer_rep with 400', async () => {
    const res = await POST(
      makeReq({ email: 'b@x.com', role: 'buyer_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(400);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('rejects deprecated role counsel with 400', async () => {
    const res = await POST(
      makeReq({ email: 'c@x.com', role: 'counsel', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(400);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('passes through counterparty invite when no deal-killers outstanding', async () => {
    getOutstandingMock.mockResolvedValueOnce([]);

    const res = await POST(
      makeReq({ email: 'b@x.com', role: 'counterparty', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });

  it('gates view_only@buyer invite on seller_side advisory when deal-killers outstanding', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'o@x.com', role: 'view_only', viewOnlyShadowSide: 'buyer', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(409);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('does not gate view_only@seller invite on seller_side advisory', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'o@x.com', role: 'view_only', viewOnlyShadowSide: 'seller', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });
});

describe('POST /participants — buy-side advisory gate', () => {
  beforeEach(() => {
    inviteMock.mockReset();
    inviteMock.mockResolvedValue({
      participant: { id: 'p1' },
      rawToken: 't',
    });
    logActivityMock.mockReset();
    getOutstandingMock.mockReset();
  });

  it('does NOT gate counterparty invite on buy-side advisory (no canonical playbook)', async () => {
    vi.mocked(getWorkspace).mockResolvedValueOnce({
      id: 'ws', name: 'Deal', cisAdvisorySide: 'buyer_side',
    } as any);
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'c@x.com', role: 'counterparty', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
    expect(getOutstandingMock).not.toHaveBeenCalled();
  });

  it('does NOT gate view_only/seller-shadow invite on buy-side advisory', async () => {
    vi.mocked(getWorkspace).mockResolvedValueOnce({
      id: 'ws', name: 'Deal', cisAdvisorySide: 'buyer_side',
    } as any);
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 's@x.com', role: 'view_only', viewOnlyShadowSide: 'seller', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
    expect(getOutstandingMock).not.toHaveBeenCalled();
  });
});
