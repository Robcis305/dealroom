import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QnaDetail } from './QnaDetail';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const baseQuestion = {
  id: 'q1',
  workspaceId: 'w1',
  title: 'What is the ARR?',
  status: 'answered' as const,
  askedById: 'u1',
  askedByName: 'Alice Smith',
  assigneeId: 'u2',
  assigneeName: 'Bob Jones',
  askedAt: new Date('2025-01-10').toISOString(),
  requestedBy: new Date('2025-02-01').toISOString(),
  visibility: 'public' as const,
  linkedDocId: null,
  linkedDocName: null,
  workstreams: [{ id: 'ws1', name: 'Finance', color: '#4CAF50' }],
  isOverdue: false,
  thread: [
    {
      id: 'm1',
      questionId: 'q1',
      authorId: 'u1',
      authorName: 'Alice Smith',
      kind: 'message' as const,
      body: 'Can you share the ARR breakdown?',
      createdAt: new Date('2025-01-10T09:00:00Z').toISOString(),
      attachments: [],
    },
  ],
  proposedAnswer: {
    id: 'm2',
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Bob Jones',
    kind: 'proposed_answer' as const,
    body: 'The ARR is $5M as of Q4.',
    createdAt: new Date('2025-01-11T10:00:00Z').toISOString(),
    attachments: [],
  },
  recipients: [],
  approvalGateActive: true,
};

function mockDetailResponse(question: typeof baseQuestion) {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify({ question }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const defaultProps = {
  workspaceId: 'w1',
  questionId: 'q1',
  currentUserId: 'u1',
  participants: [{ id: 'u1', name: 'Alice Smith' }],
  onBack: vi.fn(),
  onChanged: vi.fn(),
};

describe('QnaDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the question title after fetch', async () => {
    mockDetailResponse(baseQuestion);
    render(<QnaDetail {...defaultProps} isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getAllByText('What is the ARR?').length).toBeGreaterThan(0);
    });
  });

  it('shows the approval gate when approvalGateActive and isAdmin', async () => {
    mockDetailResponse({ ...baseQuestion, approvalGateActive: true });
    render(<QnaDetail {...defaultProps} isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('approval-gate')).toBeInTheDocument();
    });
    expect(screen.getByText(/approve & release to asker/i)).toBeInTheDocument();
  });

  it('hides the approval gate when approvalGateActive but not admin', async () => {
    mockDetailResponse({ ...baseQuestion, approvalGateActive: true });
    render(<QnaDetail {...defaultProps} isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getAllByText('What is the ARR?').length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('approval-gate')).not.toBeInTheDocument();
  });

  it('hides the approval gate when isAdmin but approvalGateActive is false', async () => {
    mockDetailResponse({ ...baseQuestion, approvalGateActive: false });
    render(<QnaDetail {...defaultProps} isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getAllByText('What is the ARR?').length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('approval-gate')).not.toBeInTheDocument();
  });

  it('renders the proposed answer sub-card when proposedAnswer is present', async () => {
    mockDetailResponse(baseQuestion);
    render(<QnaDetail {...defaultProps} isAdmin={false} />);
    await waitFor(() => {
      expect(
        screen.getByText(/proposed answer — submitted for cis approval/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('The ARR is $5M as of Q4.')).toBeInTheDocument();
  });

  it('renders the thread messages', async () => {
    mockDetailResponse(baseQuestion);
    render(<QnaDetail {...defaultProps} isAdmin={false} />);
    await waitFor(() => {
      expect(
        screen.getByText('Can you share the ARR breakdown?'),
      ).toBeInTheDocument();
    });
  });

  it('hides "Propose official answer" for non-admin non-assignee when gate inactive', async () => {
    mockDetailResponse({ ...baseQuestion, approvalGateActive: false });
    // currentUserId 'u99' is neither admin nor the assignee ('u2')
    render(<QnaDetail {...defaultProps} isAdmin={false} currentUserId="u99" />);
    await waitFor(() => {
      expect(screen.getAllByText('What is the ARR?').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Propose official answer')).not.toBeInTheDocument();
  });

  it('shows "Propose official answer" when currentUserId equals the assigneeId', async () => {
    mockDetailResponse({ ...baseQuestion, approvalGateActive: false });
    // currentUserId 'u2' matches assigneeId 'u2' in baseQuestion
    render(<QnaDetail {...defaultProps} isAdmin={false} currentUserId="u2" />);
    await waitFor(() => {
      expect(screen.getByText('Propose official answer')).toBeInTheDocument();
    });
  });
});
