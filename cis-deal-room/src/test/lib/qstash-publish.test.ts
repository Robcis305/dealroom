import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const publishJSON = vi.fn();
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(function () { return { publishJSON }; }),
}));

const PRIOR_TOKEN = process.env.QSTASH_TOKEN;
const PRIOR_APP = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  publishJSON.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = 'https://room.example.com';
});

afterAll(() => {
  if (PRIOR_TOKEN === undefined) delete process.env.QSTASH_TOKEN;
  else process.env.QSTASH_TOKEN = PRIOR_TOKEN;
  if (PRIOR_APP === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = PRIOR_APP;
});

describe('publishAnalyzeJob', () => {
  it('skips quietly when QSTASH_TOKEN is absent (dev path)', async () => {
    delete process.env.QSTASH_TOKEN;
    vi.resetModules();
    const { publishAnalyzeJob } = await import('@/lib/qstash/publish-analyze');
    await publishAnalyzeJob('analysis-id-1');
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('publishes to the cron URL with the analysis id', async () => {
    process.env.QSTASH_TOKEN = 'tok';
    vi.resetModules();
    const { publishAnalyzeJob } = await import('@/lib/qstash/publish-analyze');
    await publishAnalyzeJob('analysis-id-2');
    expect(publishJSON).toHaveBeenCalledWith({
      url: 'https://room.example.com/api/cron/analyze',
      body: { analysisId: 'analysis-id-2' },
      retries: 3,
    });
  });
});
