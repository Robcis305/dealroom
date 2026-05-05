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
