import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const PRIOR_TOKEN = process.env.ANALYZER_SERVICE_TOKEN;
const PRIOR_API = process.env.ANALYZER_API_URL;

beforeEach(() => {
  process.env.ANALYZER_SERVICE_TOKEN = 'a'.repeat(48);
  process.env.ANALYZER_API_URL = 'https://portal.example.com';
});

afterAll(() => {
  if (PRIOR_TOKEN === undefined) delete process.env.ANALYZER_SERVICE_TOKEN;
  else process.env.ANALYZER_SERVICE_TOKEN = PRIOR_TOKEN;
  if (PRIOR_API === undefined) delete process.env.ANALYZER_API_URL;
  else process.env.ANALYZER_API_URL = PRIOR_API;
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('callPortalAnalyze', () => {
  beforeEach(() => fetchMock.mockReset());

  it('returns parsed body on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      findings: [], overall_assessment: { risk_score: 1, summary: '', priority_actions: ['x'] },
      provenance: { modelUsed: 'm', promptVersion: 'v', tokensInput: 1, tokensOutput: 2, durationMs: 3 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const { callPortalAnalyze } = await import('@/lib/ai/portal-client');
    const r = await callPortalAnalyze({ fileUrl: 'https://x', mime: 'text/plain', name: 'x.txt' });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value.provenance.modelUsed).toBe('m');
  });

  it('returns terminal failure on 415', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unsupported_mime' }), { status: 415 }));
    const { callPortalAnalyze } = await import('@/lib/ai/portal-client');
    const r = await callPortalAnalyze({ fileUrl: 'https://x', mime: 'image/png', name: 'x.png' });
    expect(r.kind).toBe('terminal_error');
    if (r.kind === 'terminal_error') expect(r.code).toBe('unsupported_mime');
  });

  it('returns retryable on 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream', { status: 502 }));
    const { callPortalAnalyze } = await import('@/lib/ai/portal-client');
    const r = await callPortalAnalyze({ fileUrl: 'https://x', mime: 'text/plain', name: 'x.txt' });
    expect(r.kind).toBe('retryable');
  });

  it('sends Authorization Bearer with the configured token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      findings: [], overall_assessment: { risk_score: 1, summary: '', priority_actions: ['x'] },
      provenance: { modelUsed: 'm', promptVersion: 'v', tokensInput: 0, tokensOutput: 0, durationMs: 0 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const { callPortalAnalyze } = await import('@/lib/ai/portal-client');
    await callPortalAnalyze({ fileUrl: 'https://x', mime: 'text/plain', name: 'x.txt' });
    const call = fetchMock.mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${'a'.repeat(48)}`);
  });
});
