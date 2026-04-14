import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdateWhere = vi.fn();
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
  },
}));

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'stub' }) }));

import { POST } from '@/app/api/cron/digest/route';

describe('POST /api/cron/digest (stub mode without Upstash keys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
  });

  it('returns {processed:0} when queue is empty', async () => {
    mockSelect.mockResolvedValue([]);
    const res = await POST(new Request('http://localhost/api/cron/digest', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });
});
