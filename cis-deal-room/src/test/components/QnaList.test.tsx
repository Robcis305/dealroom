import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QnaList } from '@/components/workspace/QnaList';

const Q_NORMAL = {
  id: 'q-1',
  workspaceId: 'ws-1',
  title: 'What is the ARR growth rate?',
  status: 'new' as const,
  askedById: 'u-1',
  askedByName: 'Alice Smith',
  assigneeId: null,
  assigneeName: null,
  askedAt: '2026-06-01T10:00:00Z',
  requestedBy: '2026-06-15T00:00:00Z',
  visibility: 'public' as const,
  linkedDocId: null,
  workstreams: [{ id: 'ws-fin', name: 'Financial', color: '#3B82F6' }],
  isOverdue: false,
};

const Q_OVERDUE = {
  id: 'q-2',
  workspaceId: 'ws-1',
  title: 'Please share the customer churn data.',
  status: 'assigned' as const,
  askedById: 'u-2',
  askedByName: 'Bob Jones',
  assigneeId: 'u-3',
  assigneeName: 'Carol White',
  askedAt: '2026-05-20T09:00:00Z',
  requestedBy: '2026-05-30T00:00:00Z',
  visibility: 'public' as const,
  linkedDocId: null,
  workstreams: [{ id: 'ws-ops', name: 'Operations', color: '#10B981' }],
  isOverdue: true,
};

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ questions: [Q_NORMAL, Q_OVERDUE] }),
  }),
}));

describe('QnaList', () => {
  const onOpenQuestion = vi.fn();
  const onAsk = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders the Q&A heading', async () => {
    render(<QnaList workspaceId="ws-1" onOpenQuestion={onOpenQuestion} onAsk={onAsk} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Q&A' })).toBeInTheDocument());
  });

  it('renders both question titles', async () => {
    render(<QnaList workspaceId="ws-1" onOpenQuestion={onOpenQuestion} onAsk={onAsk} />);
    await waitFor(() => {
      expect(screen.getByText('What is the ARR growth rate?')).toBeInTheDocument();
      expect(screen.getByText('Please share the customer churn data.')).toBeInTheDocument();
    });
  });

  it('shows result count "2 of 2"', async () => {
    render(<QnaList workspaceId="ws-1" onOpenQuestion={onOpenQuestion} onAsk={onAsk} />);
    await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
  });

  it('toggling "Overdue only" hides the non-overdue question', async () => {
    render(<QnaList workspaceId="ws-1" onOpenQuestion={onOpenQuestion} onAsk={onAsk} />);
    await waitFor(() => expect(screen.getByText('What is the ARR growth rate?')).toBeInTheDocument());

    const overdueToggle = screen.getByRole('button', { name: /overdue only/i });
    fireEvent.click(overdueToggle);

    expect(screen.queryByText('What is the ARR growth rate?')).not.toBeInTheDocument();
    expect(screen.getByText('Please share the customer churn data.')).toBeInTheDocument();
  });
});
