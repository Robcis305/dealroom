import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaybookChecklistView } from '@/components/workspace/PlaybookChecklistView';

const mockCanonical = [
  {
    playbookItemId: 'pb-5',
    number: 5,
    category: 'corporate_legal' as const,
    name: 'Cap table',
    rationale: 'Must reconcile to the share.',
    dealKillerGroup: 'cap_table' as const,
    defaultPriority: 'critical' as const,
    sortOrder: 5,
    itemId: null,
    status: 'not_started' as const,
    owner: 'unassigned' as const,
    priority: 'critical' as const,
    notes: null,
    receivedAt: null,
    folderId: null,
  },
  {
    playbookItemId: 'pb-1',
    number: 1,
    category: 'corporate_legal' as const,
    name: 'Cert of Inc',
    rationale: 'Must reflect every share class.',
    dealKillerGroup: null,
    defaultPriority: 'high' as const,
    sortOrder: 1,
    itemId: null,
    status: 'received' as const,
    owner: 'seller' as const,
    priority: 'high' as const,
    notes: null,
    receivedAt: new Date(),
    folderId: null,
  },
];

describe('PlaybookChecklistView', () => {
  it('renders canonical items grouped by category', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={mockCanonical}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    expect(screen.getByText('Corporate & Legal')).toBeInTheDocument();
    expect(screen.getByText('Cap table')).toBeInTheDocument();
    expect(screen.getByText('Cert of Inc')).toBeInTheDocument();
  });

  it('pins deal-killer items above non-killer items in the same category', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={mockCanonical}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const items = screen.getAllByTestId('playbook-item');
    // Cap table (deal-killer) must come before Cert of Inc despite higher number.
    expect(items[0]).toHaveTextContent('Cap table');
    expect(items[1]).toHaveTextContent('Cert of Inc');
  });
});

describe('PlaybookChecklistView stage prefix headers', () => {
  it('renders STAGE 1 prefix above corporate_legal section and STAGE 2 above financial', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-1', number: 1, category: 'corporate_legal',
            name: 'Cert', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 1,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-12', number: 12, category: 'financial',
            name: 'Audited', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 12,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    expect(screen.getByText(/STAGE 1.*DAY 1-3/i)).toBeInTheDocument();
    expect(screen.getByText(/STAGE 2.*DAY 3-10/i)).toBeInTheDocument();
  });

  it('renders STAGE 4 prefix only above team_hr (not above ip_technical or operations_risk)', () => {
    render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-32', number: 32, category: 'team_hr',
            name: 'Org', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 32,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-39', number: 39, category: 'ip_technical',
            name: 'Trademarks', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 39,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-47', number: 47, category: 'operations_risk',
            name: 'Insurance', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'high', sortOrder: 47,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'high', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const stage4Prefixes = screen.queryAllByText(/STAGE 4.*DAY 15-21/i);
    expect(stage4Prefixes).toHaveLength(1);
  });

  it('marks the FIRST section of each stage with data-stage-first="true"', () => {
    const { container } = render(
      <PlaybookChecklistView
        workspaceId="ws-1"
        isAdmin={true}
        canonical={[
          {
            playbookItemId: 'pb-32', number: 32, category: 'team_hr',
            name: 'Org', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 32,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
          {
            playbookItemId: 'pb-39', number: 39, category: 'ip_technical',
            name: 'Trademarks', rationale: 'r', dealKillerGroup: null,
            defaultPriority: 'medium', sortOrder: 39,
            itemId: null, status: 'not_started', owner: 'unassigned',
            priority: 'medium', notes: null, receivedAt: null, folderId: null,
          },
        ]}
        custom={[]}
        folders={[]}
        onChanged={() => {}}
        onUploadForItem={() => {}}
      />,
    );

    const stage4First = container.querySelector('[data-stage="4"][data-stage-first="true"]');
    expect(stage4First).not.toBeNull();

    const stage4Continuation = container.querySelector('[data-stage="4"][data-stage-first="false"]');
    expect(stage4Continuation).not.toBeNull();
  });
});
