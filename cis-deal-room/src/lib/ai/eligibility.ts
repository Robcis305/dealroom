export const AUTO_ANALYZE_CATEGORIES = ['corporate_legal', 'commercial'] as const;
type AutoCategory = (typeof AUTO_ANALYZE_CATEGORIES)[number];

export function isAutoAnalyzeEligible(category: string): category is AutoCategory {
  return (AUTO_ANALYZE_CATEGORIES as readonly string[]).includes(category);
}
