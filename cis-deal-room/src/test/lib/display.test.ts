import { describe, it, expect } from 'vitest';
import { displayName } from '@/lib/users/display';

describe('displayName()', () => {
  it('returns "First Last" when both set', () => {
    expect(displayName({ firstName: 'Rob', lastName: 'Levin', email: 'a@b.com' })).toBe('Rob Levin');
  });

  it('falls back to email when firstName is null', () => {
    expect(displayName({ firstName: null, lastName: 'Levin', email: 'a@b.com' })).toBe('a@b.com');
  });

  it('falls back to email when lastName is null', () => {
    expect(displayName({ firstName: 'Rob', lastName: null, email: 'a@b.com' })).toBe('a@b.com');
  });

  it('falls back to email when both null', () => {
    expect(displayName({ firstName: null, lastName: null, email: 'a@b.com' })).toBe('a@b.com');
  });

  it('trims whitespace in names before joining', () => {
    expect(displayName({ firstName: 'Rob ', lastName: ' Levin', email: 'a@b.com' })).toBe('Rob Levin');
  });
});
