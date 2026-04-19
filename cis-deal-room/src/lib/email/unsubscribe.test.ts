import { describe, it, expect, beforeEach } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'a-strong-secret-at-least-thirty-two-chars';
});

describe('unsubscribe token', () => {
  it('round-trips', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    expect(verifyUnsubscribeToken(t)).toMatchObject({ userId: 'u1', channel: 'uploads' });
  });

  it('rejects tampered tokens', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'uploads' });
    expect(verifyUnsubscribeToken(t + 'x')).toBeNull();
  });

  it('rejects unknown channel', () => {
    const t = signUnsubscribeToken({ userId: 'u1', channel: 'bogus' as any });
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
});
