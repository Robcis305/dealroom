import 'server-only';
import { Client } from '@upstash/qstash';
import { analyzerEnv } from '@/lib/env/analyzer';

export async function publishAnalyzeJob(analysisId: string): Promise<void> {
  const token = analyzerEnv.qstashToken;
  if (!token) {
    console.warn('[publish-analyze] QSTASH_TOKEN absent; skipping publish (dev mode).');
    return;
  }
  const client = new Client({ token });
  await client.publishJSON({
    url: `${analyzerEnv.appUrl}/api/cron/analyze`,
    body: { analysisId },
    retries: 3,
  });
}
