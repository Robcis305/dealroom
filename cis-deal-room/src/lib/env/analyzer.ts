import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const analyzerEnv = {
  get serviceToken(): string {
    const v = required('ANALYZER_SERVICE_TOKEN');
    if (v.length < 32) throw new Error('ANALYZER_SERVICE_TOKEN must be ≥32 chars');
    return v;
  },
  get apiUrl(): string {
    return required('ANALYZER_API_URL').replace(/\/+$/, '');
  },
  // Optional — when absent, the producer falls back to inline invocation
  // for local dev. Production env validates presence at producer-call time.
  get qstashToken(): string | null {
    return process.env.QSTASH_TOKEN ?? null;
  },
  get appUrl(): string {
    return required('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
  },
};
