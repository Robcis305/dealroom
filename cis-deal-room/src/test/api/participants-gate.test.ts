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
  getWorkspace: vi.fn().mockResolvedValue({ id: 'ws', name: 'Deal' }),
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email/invitation', () => ({ InvitationEmail: vi.fn() }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://test' }));

vi.mock('@/lib/dal/activity', () => ({
  logActivity: logActivityMock,
}));

import { POST } from '@/app/api/workspaces/[id]/participants/route';

function makeReq(body: unknown): Request {
  return new Request('http://test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /participants — buyer-invite gate', () => {
  beforeEach(() => {
    inviteMock.mockReset();
    inviteMock.mockResolvedValue({
      participant: { id: 'p1' },
      rawToken: 't',
    });
    logActivityMock.mockReset();
    getOutstandingMock.mockReset();
  });

  it('blocks buyer_rep invite with outstanding deal-killers and no ack', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 'b@x.com', role: 'buyer_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.outstanding).toHaveLength(1);
    expect(json.outstanding[0].group).toBe('cap_table');
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('allows buyer_rep invite with outstanding deal-killers when ack matches', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({
        email: 'b@x.com',
        role: 'buyer_rep',
        folderIds: [],
        acknowledgement: 'share anyway',
      }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
    expect(logActivityMock).toHaveBeenCalled();
  });

  it('does not gate seller_rep invites', async () => {
    getOutstandingMock.mockResolvedValueOnce([
      { group: 'cap_table', status: 'blocked', color: 'red', members: [] },
    ]);

    const res = await POST(
      makeReq({ email: 's@x.com', role: 'seller_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });

  it('passes through buyer_rep invite when no deal-killers outstanding', async () => {
    getOutstandingMock.mockResolvedValueOnce([]);

    const res = await POST(
      makeReq({ email: 'b@x.com', role: 'buyer_rep', folderIds: [] }),
      { params: Promise.resolve({ id: 'ws' }) },
    );

    expect(res.status).toBe(201);
    expect(inviteMock).toHaveBeenCalled();
  });
});
