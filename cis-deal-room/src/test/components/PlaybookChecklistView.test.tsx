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
