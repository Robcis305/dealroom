import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdateWhere = vi.fn();
const mockExecute = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));

import { POST } from '@/app/api/cron/digest/route';
import { sendEmail } from '@/lib/email/send';

describe('POST /api/cron/digest (stub mode without Upstash keys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    process.env.UNSUBSCRIBE_SECRET = 'a-strong-secret-at-least-thirty-two-chars';
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it('returns {processed:0} when queue is empty', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });

  it('returns 500 in production when QStash signing keys are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(500);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('claims rows via db.execute and does not fall back to db.select', async () => {
    // Return one claimed row so the route proceeds past the empty-check.
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 'n1',
          user_id: 'u1',
          workspace_id: 'w1',
          action: 'uploaded',
          target_type: 'file',
          target_id: 't1',
          metadata: {},
          attempts: 0,
          created_at: new Date(),
        },
      ],
    });
    // user + workspace lookups (two successive db.select(...).from(...).where(...))
    mockSelect
      .mockResolvedValueOnce([{ id: 'u1', email: 'u@x.com', firstName: 'U', lastName: 'X' }])
      .mockResolvedValueOnce([{ id: 'w1', name: 'W' }]);

    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    // Should have called execute for the claim (once). Must NOT have issued a
    // second execute for the old-style final bulk-update.
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('on send failure, resets processed_at and bumps attempts via drizzle inArray', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 'n2',
          user_id: 'u2',
          workspace_id: 'w2',
          action: 'uploaded',
          target_type: 'file',
          target_id: 't2',
          metadata: {},
          attempts: 1,
          created_at: new Date(),
        },
      ],
    });
    mockSelect
      .mockResolvedValueOnce([{ id: 'u2', email: 'u2@x.com', firstName: 'U', lastName: '2' }])
      .mockResolvedValueOnce([{ id: 'w2', name: 'W2' }]);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('boom'));

    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    // The failure-path must issue a drizzle ORM update (not db.execute), so
    // mockUpdateWhere is the right spy. mockExecute should still be only 1 call
    // (the claim), confirming the failure path no longer uses db.execute.
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
