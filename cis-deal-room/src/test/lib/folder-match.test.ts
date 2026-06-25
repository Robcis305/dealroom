import { describe, it, expect } from 'vitest';
import { defaultFolderIdForCategory } from '@/lib/checklist/folder-match';

const FOLDERS = [
  { id: 'f-fin', name: 'Financials' },
  { id: 'f-legal', name: 'Legal' },
  { id: 'f-ops', name: 'Operations' },
  { id: 'f-hc', name: 'Human Capital' },
  { id: 'f-tech', name: 'Technology' },
];

describe('defaultFolderIdForCategory', () => {
  it('maps each playbook category to its canonical seed folder', () => {
    expect(defaultFolderIdForCategory('corporate_legal', FOLDERS)).toBe('f-legal');
    expect(defaultFolderIdForCategory('financial', FOLDERS)).toBe('f-fin');
    expect(defaultFolderIdForCategory('team_hr', FOLDERS)).toBe('f-hc');
    expect(defaultFolderIdForCategory('ip_technical', FOLDERS)).toBe('f-tech');
    expect(defaultFolderIdForCategory('operations_risk', FOLDERS)).toBe('f-ops');
  });

  it('returns null for commercial (no canonical folder)', () => {
    expect(defaultFolderIdForCategory('commercial', FOLDERS)).toBeNull();
  });

  it('matches tolerantly across plural/case differences', () => {
    expect(defaultFolderIdForCategory('financial', [{ id: 'x', name: 'financial' }])).toBe('x');
  });

  it('returns null when the target folder is absent', () => {
    expect(defaultFolderIdForCategory('financial', [{ id: 'x', name: 'Legal' }])).toBeNull();
  });
});
