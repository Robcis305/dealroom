import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dal/index', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: vi.fn() }));
vi.mock('@/lib/dal/participants', () => ({
  getParticipants: vi.fn(),
  inviteParticipant: vi.fn(),
}));
vi.mock('@/lib/dal/workspaces', () => ({
  getWorkspaceById: vi.fn(),
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));

import { verifySession } from '@/lib/dal/index';
import { requireDealAccess } from '@/lib/dal/access';
import { getParticipants, inviteParticipant } from '@/lib/dal/participants';
import { getWorkspaceById } from '@/lib/dal/workspaces';
import { GET, POST } from '@/app/api/workspaces/[id]/participants/route';

const adminSession = { sessionId: 's1', userId: 'admin-u', userEmail: 'admin@cis.com', isAdmin: true };
const clientSession = { sessionId: 's2', userId: 'client-u', userEmail: 'client@x.com', isAdmin: false };
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeGet() {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/participants`);
}

function makePost(body: object) {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/workspaces/[id]/participants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(401);
  });

  it('returns list of participants for authorized user', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(requireDealAccess).mockResolvedValue(undefined);
    vi.mocked(getParticipants).mockResolvedValue([
      { id: 'p1', userId: 'u1', email: 'a@b.com', role: 'client', status: 'active' },
    ] as any);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: WORKSPACE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/workspaces/[id]/participants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(clientSession);
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    const res = await POST(
      makePost({ email: 'not-an-email', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('creates participant, sends invitation email, returns 201', async () => {
    vi.mocked(verifySession).mockResolvedValue(adminSession);
    vi.mocked(getWorkspaceById).mockResolvedValue({ id: WORKSPACE_ID, name: 'Test Deal' } as any);
    vi.mocked(inviteParticipant).mockResolvedValue({
      participant: { id: 'p1', userId: 'u1', role: 'client', status: 'invited' } as any,
      rawToken: 'fake-token',
    });
    const res = await POST(
      makePost({ email: 'x@y.com', role: 'client', folderIds: [] }),
      { params: Promise.resolve({ id: WORKSPACE_ID }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('p1');
  });
});
