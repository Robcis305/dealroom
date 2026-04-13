import { describe, it, expect } from 'vitest';
import { generateToken, hashToken, timingSafeTokenCompare } from './tokens';

describe('generateToken()', () => {
  it('returns a 64-character hex string', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different token on each call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });
});

describe('hashToken()', () => {
  it('returns a deterministic SHA-256 hex digest', () => {
    const token = 'deadbeef';
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    // SHA-256 output is 64 hex chars
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different hashes for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('timingSafeTokenCompare()', () => {
  it('returns true when two identical hex tokens are compared', () => {
    const h = hashToken('x');
    expect(timingSafeTokenCompare(h, h)).toBe(true);
  });

  it('returns false when tokens differ', () => {
    const a = hashToken('x');
    const b = hashToken('y');
    expect(timingSafeTokenCompare(a, b)).toBe(false);
  });
});
