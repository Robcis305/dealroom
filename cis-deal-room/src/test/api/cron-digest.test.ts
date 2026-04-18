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

  it('claims rows in a single UPDATE … RETURNING, not in a separate pass', async () => {
    // We assert the shape: the cron route must now use db.execute with a raw SQL
    // that RETURNs rows; if it still uses two queries (select then update), the
    // mocked db.select will be called and the spy will catch it.
    const selectSpy = vi.fn().mockResolvedValue([]);
    mockSelect.mockImplementation(selectSpy);
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
