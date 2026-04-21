import { describe, it, expect } from 'vitest';
import { roleLabel, assignableRolesFor } from '@/lib/participants/roles';

describe('roleLabel()', () => {
  it('returns plain labels for non-rep roles regardless of cisAdvisorySide', () => {
    expect(roleLabel('admin', 'buyer_side')).toBe('Admin');
    expect(roleLabel('cis_team', 'seller_side')).toBe('CIS Team');
    expect(roleLabel('client', 'buyer_side')).toBe('Client');
    expect(roleLabel('counsel', 'seller_side')).toBe('Counsel');
    expect(roleLabel('view_only', 'buyer_side')).toBe('View Only');
  });

  it('shows "Seller Rep" when CIS advises buyer side', () => {
    expect(roleLabel('seller_rep', 'buyer_side')).toBe('Seller Rep');
  });

  it('shows "Buyer Rep" when CIS advises seller side', () => {
    expect(roleLabel('buyer_rep', 'seller_side')).toBe('Buyer Rep');
  });
});

describe('assignableRolesFor()', () => {
  it('includes seller_rep but not buyer_rep when CIS advises buyer side', () => {
    const roles = assignableRolesFor('buyer_side');
    const values = roles.map((r) => r.value);
    expect(values).toContain('seller_rep');
    expect(values).not.toContain('buyer_rep');
  });

  it('includes buyer_rep but not seller_rep when CIS advises seller side', () => {
    const roles = assignableRolesFor('seller_side');
    const values = roles.map((r) => r.value);
    expect(values).toContain('buyer_rep');
    expect(values).not.toContain('seller_rep');
  });

  it('always includes admin, cis_team, client, view_only, seller_counsel, buyer_counsel', () => {
    for (const side of ['buyer_side', 'seller_side'] as const) {
      const values = assignableRolesFor(side).map((r) => r.value);
      expect(values).toContain('admin');
      expect(values).toContain('cis_team');
      expect(values).toContain('client');
      expect(values).toContain('view_only');
      expect(values).toContain('seller_counsel');
      expect(values).toContain('buyer_counsel');
    }
  });

  it('does not include deprecated counsel role', () => {
    for (const side of ['buyer_side', 'seller_side'] as const) {
      const values = assignableRolesFor(side).map((r) => r.value);
      expect(values).not.toContain('counsel');
    }
  });
});
