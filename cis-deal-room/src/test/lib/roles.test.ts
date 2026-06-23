import { describe, it, expect } from 'vitest';
import { roleLabel, assignableRolesFor } from '@/lib/participants/roles';

describe('roleLabel', () => {
  it('labels new side-relative roles', () => {
    expect(roleLabel('client', 'seller_side')).toBe('Client');
    expect(roleLabel('client_counsel', 'seller_side')).toBe('Client Counsel');
    expect(roleLabel('counterparty', 'seller_side')).toBe('Counterparty');
    expect(roleLabel('cis_team', 'seller_side')).toBe('CIS Team');
    expect(roleLabel('view_only', 'seller_side')).toBe('View-only');
  });
});

describe('assignableRolesFor', () => {
  it('offers exactly the 5 active roles + admin, no deprecated', () => {
    const vals = assignableRolesFor('seller_side').map((r) => r.value);
    expect(vals).toEqual(['admin', 'cis_team', 'client', 'client_counsel', 'counterparty', 'view_only']);
    expect(vals).not.toContain('seller_rep');
    expect(vals).not.toContain('buyer_counsel');
  });
});
