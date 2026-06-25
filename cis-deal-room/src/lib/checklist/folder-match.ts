import type { PlaybookCategory } from '@/types';

export type FolderMatchKind = 'exact' | 'fuzzy' | 'none';

export interface FolderSummary {
  id: string;
  name: string;
}

export interface FolderResolution {
  category: string;
  matchedFolderId: string | null;
  matchedFolderName: string | null;
  matchKind: FolderMatchKind;
}

/**
 * Lowercase, trim, strip a trailing 's'. Catches common plural/case mismatches
 * ('Financial' ↔ 'Financials') without collapsing distinct categories
 * ('Technology' ↔ 'Technology & IP').
 */
export function normalizeFolderKey(s: string): string {
  return s.trim().toLowerCase().replace(/s$/, '');
}

/**
 * Maps each playbook category to the canonical seed folder it belongs in (see
 * CANONICAL_FOLDERS in the deal-setup wizard). `commercial` has no dedicated
 * canonical folder, so it resolves to null (no smart default). Used to default
 * the upload modal's target folder when uploading against a checklist item, so
 * documents land in the right folder without the user having to re-pick it.
 */
const CATEGORY_TO_FOLDER_NAME: Record<PlaybookCategory, string | null> = {
  corporate_legal: 'Legal',
  financial: 'Financials',
  commercial: null,
  team_hr: 'Human Capital',
  ip_technical: 'Technology',
  operations_risk: 'Operations',
};

/**
 * Resolves the default upload folder id for a playbook item's category against
 * the workspace's actual folders. Tolerant of plural/case differences (via
 * normalizeFolderKey) so a renamed 'Financial' still matches 'Financials'.
 * Returns null when the category has no mapping or no folder matches.
 */
export function defaultFolderIdForCategory(
  category: PlaybookCategory,
  folders: FolderSummary[],
): string | null {
  const targetName = CATEGORY_TO_FOLDER_NAME[category];
  if (!targetName) return null;
  const key = normalizeFolderKey(targetName);
  const match = folders.find((f) => normalizeFolderKey(f.name) === key);
  return match?.id ?? null;
}

/**
 * For each input category, determine which existing folder it resolves to
 * (or 'none' if it would require creating a new folder). Used by the checklist
 * import flow to show the admin a mapping step before the actual import.
 */
export function resolveFolderMatches(
  categories: string[],
  existing: FolderSummary[],
): FolderResolution[] {
  const byExactName = new Map<string, FolderSummary>();
  const byNormalized = new Map<string, FolderSummary>();
  for (const f of existing) {
    byExactName.set(f.name, f);
    const key = normalizeFolderKey(f.name);
    if (!byNormalized.has(key)) byNormalized.set(key, f);
  }

  return categories.map((category) => {
    const exact = byExactName.get(category);
    if (exact) {
      return {
        category,
        matchedFolderId: exact.id,
        matchedFolderName: exact.name,
        matchKind: 'exact',
      };
    }
    const fuzzy = byNormalized.get(normalizeFolderKey(category));
    if (fuzzy) {
      return {
        category,
        matchedFolderId: fuzzy.id,
        matchedFolderName: fuzzy.name,
        matchKind: 'fuzzy',
      };
    }
    return {
      category,
      matchedFolderId: null,
      matchedFolderName: null,
      matchKind: 'none',
    };
  });
}
