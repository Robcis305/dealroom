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
