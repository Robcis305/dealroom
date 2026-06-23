import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks so vi.mock factories can reference them
const { verifySessionMock, requireDealAccessMock, dbSelectMock } = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  requireDealAccessMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock('@/lib/dal/index', () => ({ verifySession: verifySessionMock }));
vi.mock('@/lib/dal/access', () => ({ requireDealAccess: requireDealAccessMock }));

// Minimal db mock — route uses db.select().from().where().limit() for workspace + participant lookups
vi.mock('@/db', () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock('@/db/schema', () => ({
  workspaces: {},
  workspaceParticipants: {},
  checklistItems: {},
}));

vi.mock('@/lib/dal/checklist', () => ({
  ensureChecklistForWorkspace: vi.fn().mockResolvedValue({ id: 'cl-1' }),
  getChecklistForWorkspace: vi.fn().mockResolvedValue({ id: 'cl-1' }),
  ownerFilterForSession: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/dal/playbook', () => ({
  getReadinessSummary: vi.fn().mockResolvedValue({
    total: 48,
    ready: 12,
    byCategory: {
      corporate_legal: { total: 8, ready: 3 },
      financial: { total: 8, ready: 3 },
      commercial: { total: 8, ready: 2 },
      team_hr: { total: 8, ready: 2 },
      ip_technical: { total: 8, ready: 1 },
      operations_risk: { total: 8, ready: 1 },
    },
    byStage: {
      1: { total: 8, ready: 3, label: 'Cap & Corp', dayRange: 'Day 1-3' },
      2: { total: 8, ready: 3, label: 'Financial', dayRange: 'Day 3-10' },
      3: { total: 8, ready: 2, label: 'Commercial', dayRange: 'Day 10-15' },
      4: { total: 24, ready: 4, label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
    },
    dealKillerGroups: [],
  }),
  shouldShowCanonicalPlaybook: vi.fn().mockReturnValue(true),
  STAGE_META: {
    1: { label: 'Cap & Corp', dayRange: 'Day 1-3' },
    2: { label: 'Financial', dayRange: 'Day 3-10' },
    3: { label: 'Commercial', dayRange: 'Day 10-15' },
    4: { label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' },
  },
}));

import { GET } from '@/app/api/workspaces/[id]/readiness/route';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeGet() {
  return new Request(`http://localhost/api/workspaces/${WORKSPACE_ID}/readiness`);
}

function makeParams() {
  return { params: Promise.resolve({ id: WORKSPACE_ID }) };
}

// Helper: make the db.select chain return specific rows per call sequence.
// The route calls db.select() twice for non-admin users:
//   1. workspace lookup → returns workspace row
//   2. participant lookup → returns participant row
function setupDbSelect(workspaceRow: object | null, participantRow: object | null) {
  let callCount = 0;
  dbSelectMock.mockImplementation(() => {
    callCount++;
    const rowsForThisCall = callCount === 1
      ? (workspaceRow ? [workspaceRow] : [])
      : (participantRow ? [participantRow] : []);
    return {
      from: () => ({
        where: () => ({
          limit: async () => rowsForThisCall,
        }),
      }),
    };
  });
}

const sellerWorkspace = { cisAdvisorySide: 'seller_side' };

describe('GET /api/workspaces/[id]/readiness — PLAYBOOK_VISIBLE_ROLES', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDealAccessMock.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    verifySessionMock.mockResolvedValue(null);
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(401);
  });

  it('admin gets full canonical summary (skips participant lookup)', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-admin', userEmail: 'a@cis.com', isAdmin: true });
    // Admin: only one db call (workspace lookup)
    dbSelectMock.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [sellerWorkspace],
        }),
      }),
    }));

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('canonical');
    expect(body.total).toBe(48);
  });

  it.each(['client', 'client_counsel', 'cis_team'] as const)(
    '%s role receives the full canonical readiness summary',
    async (role) => {
      verifySessionMock.mockResolvedValue({ userId: 'u1', userEmail: 'u@x.com', isAdmin: false });
      setupDbSelect(sellerWorkspace, { role });

      const res = await GET(makeGet(), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe('canonical');
      expect(body.total).toBe(48);
    },
  );

  it('counterparty role is denied the canonical readiness summary (403)', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-cp', userEmail: 'cp@x.com', isAdmin: false });
    setupDbSelect(sellerWorkspace, { role: 'counterparty' });

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('view_only role is denied the canonical readiness summary (403)', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-vo', userEmail: 'vo@x.com', isAdmin: false });
    setupDbSelect(sellerWorkspace, { role: 'view_only' });

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('deprecated seller_rep role is denied (not in PLAYBOOK_VISIBLE_ROLES)', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-sr', userEmail: 'sr@x.com', isAdmin: false });
    setupDbSelect(sellerWorkspace, { role: 'seller_rep' });

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('deprecated seller_counsel role is denied (not in PLAYBOOK_VISIBLE_ROLES)', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-sc', userEmail: 'sc@x.com', isAdmin: false });
    setupDbSelect(sellerWorkspace, { role: 'seller_counsel' });

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 403 when no participant row found', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-x', userEmail: 'x@x.com', isAdmin: false });
    setupDbSelect(sellerWorkspace, null);

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 404 when workspace not found', async () => {
    verifySessionMock.mockResolvedValue({ userId: 'u-x', userEmail: 'x@x.com', isAdmin: false });
    setupDbSelect(null, null);

    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(404);
  });
});
