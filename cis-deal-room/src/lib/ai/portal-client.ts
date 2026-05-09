import 'server-only';
import { analyzerEnv } from '@/lib/env/analyzer';

export type PortalProvenance = {
  modelUsed: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
};

export type PortalFinding = {
  clause_text: string;
  category: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'FAVORABLE';
  impact_summary: string;
  benchmark_comparison: string;
  recommendation: string;
  flag_for_review: boolean;
};

export type PortalAnalyzeResponse = {
  findings: PortalFinding[];
  overall_assessment: {
    risk_score: number;
    summary: string;
    priority_actions: string[];
  };
  provenance: PortalProvenance;
};

export type PortalCallResult =
  | { kind: 'ok'; value: PortalAnalyzeResponse }
  | { kind: 'terminal_error'; code: string; status: number }
  | { kind: 'retryable'; status: number; message: string };

export async function callPortalAnalyze(args: {
  fileUrl: string;
  mime: string;
  name: string;
}): Promise<PortalCallResult> {
  const url = `${analyzerEnv.apiUrl}/api/internal/analyze`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${analyzerEnv.serviceToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (res.status === 200) {
    return { kind: 'ok', value: (await res.json()) as PortalAnalyzeResponse };
  }
  if (res.status === 400 || res.status === 401 || res.status === 413
      || res.status === 415 || res.status === 422) {
    let code = `http_${res.status}`;
    try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* ignore */ }
    return { kind: 'terminal_error', code, status: res.status };
  }
  return { kind: 'retryable', status: res.status, message: await res.text() };
}
