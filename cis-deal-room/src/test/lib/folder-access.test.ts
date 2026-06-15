import { describe, it, expect } from 'vitest';
import { hasFolderAccess, isFullAccessRole } from '@/lib/participants/folder-access';

describe('isFullAccessRole()', () => {
  it('is true for admin and cis_team', () => {
    expect(isFullAccessRole('admin')).toBe(true);
    expect(isFullAccessRole('cis_team')).toBe(true);
  });
  it('is false for other roles', () => {
    expect(isFullAccessRole('client')).toBe(false);
    expect(isFullAccessRole('seller_rep')).toBe(false);
    expect(isFullAccessRole('view_only')).toBe(false);
  });
});

describe('hasFolderAccess()', () => {
  const FOLDER = 'folder-1';
  it('returns true for admin/cis_team even with no explicit grants', () => {
    expect(hasFolderAccess({ role: 'admin', folderIds: [] }, FOLDER)).toBe(true);
    expect(hasFolderAccess({ role: 'cis_team', folderIds: [] }, FOLDER)).toBe(true);
  });
  it('returns true for a non-admin with an explicit grant', () => {
    expect(hasFolderAccess({ role: 'client', folderIds: ['folder-1', 'folder-2'] }, FOLDER)).toBe(true);
  });
  it('returns false for a non-admin without a grant', () => {
    expect(hasFolderAccess({ role: 'client', folderIds: ['folder-2'] }, FOLDER)).toBe(false);
  });
  it('returns true for an invited (not yet active) participant holding a grant', () => {
    expect(hasFolderAccess({ role: 'seller_rep', folderIds: ['folder-1'] }, FOLDER)).toBe(true);
  });
});
