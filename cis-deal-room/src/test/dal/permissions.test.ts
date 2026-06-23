import { describe, it, expect } from 'vitest';
import { canPerform } from '@/lib/dal/permissions';
describe('canPerform', () => {
  it('upload only for CIS/Client/Client Counsel/Admin', () => {
    for (const r of ['admin','cis_team','client','client_counsel'] as const) expect(canPerform(r,'upload')).toBe(true);
    for (const r of ['counterparty','view_only'] as const) expect(canPerform(r,'upload')).toBe(false);
  });
  it('download for everyone (folder gate handles access)', () => {
    for (const r of ['admin','cis_team','client','client_counsel','counterparty','view_only'] as const) expect(canPerform(r,'download')).toBe(true);
  });
});
