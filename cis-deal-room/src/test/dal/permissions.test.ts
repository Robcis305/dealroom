import { describe, it, expect } from 'vitest';
import { canPerform } from '@/lib/dal/permissions';

describe('canPerform()', () => {
  // Admin and CIS Team get everything in granted folders
  it('admin role can upload', () => {
    expect(canPerform('admin', 'upload')).toBe(true);
  });
  it('admin role can download', () => {
    expect(canPerform('admin', 'download')).toBe(true);
  });
  it('cis_team can upload', () => {
    expect(canPerform('cis_team', 'upload')).toBe(true);
  });
  it('cis_team can download', () => {
    expect(canPerform('cis_team', 'download')).toBe(true);
  });

  // Client / Counsel / Reps get upload+download
  it('client can upload', () => {
    expect(canPerform('client', 'upload')).toBe(true);
  });
  it('client can download', () => {
    expect(canPerform('client', 'download')).toBe(true);
  });
  it('counsel can upload and download', () => {
    expect(canPerform('counsel', 'upload')).toBe(true);
    expect(canPerform('counsel', 'download')).toBe(true);
  });
  it('buyer_rep can upload and download', () => {
    expect(canPerform('buyer_rep', 'upload')).toBe(true);
    expect(canPerform('buyer_rep', 'download')).toBe(true);
  });
  it('seller_rep can upload and download', () => {
    expect(canPerform('seller_rep', 'upload')).toBe(true);
    expect(canPerform('seller_rep', 'download')).toBe(true);
  });

  // View only — download only
  it('view_only can download', () => {
    expect(canPerform('view_only', 'download')).toBe(true);
  });
  it('view_only cannot upload', () => {
    expect(canPerform('view_only', 'upload')).toBe(false);
  });
});
