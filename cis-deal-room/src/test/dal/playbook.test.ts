import { describe, it, expect, vi } from 'vitest';

const dbResults: Record<string, unknown[]> = {
  playbook_join: [],
  custom: [],
};

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: async () => dbResults.playbook_join,
          }),
        }),
        where: () => ({
          orderBy: async () => dbResults.custom,
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/dal/index', () => ({
  verifySession: async () => ({ userId: 'u1', userEmail: 'x@x', isAdmin: true }),
}));

import { getPlaybookView } from '@/lib/dal/playbook';

const CHECKLIST_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('getPlaybookView', () => {
  it('returns 48 canonical rows with default state when no checklist_items exist', async () => {
    dbResults.playbook_join = Array.from({ length: 48 }, (_, i) => ({
      playbookItemId: `pb-${i + 1}`,
      number: i + 1,
      category: 'corporate_legal',
      name: `Item ${i + 1}`,
      rationale: 'Why',
      dealKillerGroup: null,
      defaultPriority: 'medium',
      sortOrder: i + 1,
      itemId: null,
      status: null,
      owner: null,
      priority: null,
      notes: null,
      receivedAt: null,
      folderId: null,
    }));
    dbResults.custom = [];

    const view = await getPlaybookView(CHECKLIST_ID);

    expect(view.canonical).toHaveLength(48);
    expect(view.canonical[0].status).toBe('not_started');
    expect(view.canonical[0].owner).toBe('unassigned');
    expect(view.custom).toEqual([]);
  });

  it('overlays checklist_items state onto canonical rows when present', async () => {
    dbResults.playbook_join = [
      {
        playbookItemId: 'pb-5',
        number: 5,
        category: 'corporate_legal',
        name: 'Cap table',
        rationale: 'Why',
        dealKillerGroup: 'cap_table',
        defaultPriority: 'critical',
        sortOrder: 5,
        itemId: 'ci-1',
        status: 'received',
        owner: 'seller',
        priority: 'critical',
        notes: 'looks good',
        receivedAt: new Date('2026-05-01'),
        folderId: null,
      },
    ];
    dbResults.custom = [];

    const view = await getPlaybookView(CHECKLIST_ID);

    expect(view.canonical).toHaveLength(1);
    expect(view.canonical[0].status).toBe('received');
    expect(view.canonical[0].notes).toBe('looks good');
  });

  it('returns custom items separately', async () => {
    dbResults.playbook_join = [];
    dbResults.custom = [
      {
        itemId: 'ci-99',
        category: 'commercial',
        name: 'Custom thing',
        status: 'in_progress',
        owner: 'seller',
        priority: 'medium',
        notes: null,
        folderId: 'f-1',
        sortOrder: 100,
      },
    ];

    const view = await getPlaybookView(CHECKLIST_ID);
    expect(view.canonical).toEqual([]);
    expect(view.custom).toHaveLength(1);
    expect(view.custom[0].name).toBe('Custom thing');
  });
});

describe('getReadinessSummary', () => {
  it('counts ready items as received/waived/n_a; returns 0/48 with no rows', async () => {
    dbResults.playbook_join = Array.from({ length: 48 }, (_, i) => ({
      playbookItemId: `pb-${i + 1}`,
      number: i + 1,
      category: i < 11 ? 'corporate_legal' : 'financial',
      name: `Item ${i + 1}`,
      rationale: 'r',
      dealKillerGroup: null,
      defaultPriority: 'medium',
      sortOrder: i + 1,
      itemId: null,
      status: null,
      owner: null,
      priority: null,
      notes: null,
      receivedAt: null,
      folderId: null,
    }));
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.total).toBe(48);
    expect(summary.ready).toBe(0);
    expect(summary.byCategory.corporate_legal.total).toBe(11);
    expect(summary.byCategory.corporate_legal.ready).toBe(0);
  });

  it('counts received/waived/n_a as ready; blocked and not_started not ready', async () => {
    const base = (status: string | null, dealKiller: string | null = null) => ({
      playbookItemId: `pb-x`,
      number: 1,
      category: 'corporate_legal',
      name: 'X',
      rationale: 'r',
      dealKillerGroup: dealKiller,
      defaultPriority: 'medium',
      sortOrder: 1,
      itemId: 'ci',
      status,
      owner: 'seller',
      priority: 'medium',
      notes: null,
      receivedAt: null,
      folderId: null,
    });
    dbResults.playbook_join = [
      base('received'),
      base('waived'),
      base('n_a'),
      base('blocked'),
      base('in_progress'),
      base('not_started'),
      base(null), // virtual = not_started
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    expect(summary.total).toBe(7);
    expect(summary.ready).toBe(3);
  });

  it('groups deal-killers by deal_killer_group with worst-of status', async () => {
    dbResults.playbook_join = [
      {
        playbookItemId: 'pb-33', number: 33, category: 'team_hr',
        name: 'Offers', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 33,
        itemId: 'ci-a', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-34', number: 34, category: 'team_hr',
        name: 'Contractors', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 34,
        itemId: null, status: null, owner: null,
        priority: null, notes: null, receivedAt: null, folderId: null,
      },
    ];
    dbResults.custom = [];

    const { getReadinessSummary } = await import('@/lib/dal/playbook');
    const summary = await getReadinessSummary(CHECKLIST_ID);

    const ip = summary.dealKillerGroups.find((g) => g.group === 'ip_assignment');
    expect(ip).toBeDefined();
    // worst-of: received + not_started → not_started
    expect(ip!.status).toBe('not_started');
  });
});

describe('getOutstandingDealKillerGroups', () => {
  it('returns only groups with at least one non-ready member', async () => {
    dbResults.playbook_join = [
      // ip_assignment: one received, one not_started → outstanding
      {
        playbookItemId: 'pb-33', number: 33, category: 'team_hr',
        name: 'A', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 33,
        itemId: 'ci', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-34', number: 34, category: 'team_hr',
        name: 'B', rationale: 'r', dealKillerGroup: 'ip_assignment',
        defaultPriority: 'critical', sortOrder: 34,
        itemId: null, status: null, owner: null,
        priority: null, notes: null, receivedAt: null, folderId: null,
      },
      // revenue_bridge: both received → not outstanding
      {
        playbookItemId: 'pb-14', number: 14, category: 'financial',
        name: 'C', rationale: 'r', dealKillerGroup: 'revenue_bridge',
        defaultPriority: 'critical', sortOrder: 14,
        itemId: 'ci2', status: 'waived', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
      {
        playbookItemId: 'pb-16', number: 16, category: 'financial',
        name: 'D', rationale: 'r', dealKillerGroup: 'revenue_bridge',
        defaultPriority: 'critical', sortOrder: 16,
        itemId: 'ci3', status: 'received', owner: 'seller',
        priority: 'critical', notes: null, receivedAt: null, folderId: null,
      },
    ];
    dbResults.custom = [];

    const { getOutstandingDealKillerGroups } = await import('@/lib/dal/playbook');
    const result = await getOutstandingDealKillerGroups(CHECKLIST_ID);

    expect(result).toHaveLength(1);
    expect(result[0].group).toBe('ip_assignment');
  });
});

describe('CATEGORY_TO_STAGE mapping', () => {
  it('covers all 6 canonical categories with no gaps', async () => {
    const { CATEGORY_TO_STAGE } = await import('@/lib/dal/playbook');

    expect(CATEGORY_TO_STAGE.corporate_legal).toBe(1);
    expect(CATEGORY_TO_STAGE.financial).toBe(2);
    expect(CATEGORY_TO_STAGE.commercial).toBe(3);
    expect(CATEGORY_TO_STAGE.team_hr).toBe(4);
    expect(CATEGORY_TO_STAGE.ip_technical).toBe(4);
    expect(CATEGORY_TO_STAGE.operations_risk).toBe(4);
  });
});

describe('STAGE_META', () => {
  it('exposes label + dayRange for each of the 4 stages', async () => {
    const { STAGE_META } = await import('@/lib/dal/playbook');

    expect(STAGE_META[1]).toEqual({ label: 'Cap & Corp', dayRange: 'Day 1-3' });
    expect(STAGE_META[2]).toEqual({ label: 'Financial', dayRange: 'Day 3-10' });
    expect(STAGE_META[3]).toEqual({ label: 'Commercial', dayRange: 'Day 10-15' });
    expect(STAGE_META[4]).toEqual({ label: 'Legal · IP · HR · Ops', dayRange: 'Day 15-21' });
  });
});
