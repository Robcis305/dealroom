import { describe, it, expect } from 'vitest';
import { isAutoAnalyzeEligible, AUTO_ANALYZE_CATEGORIES } from '@/lib/ai/eligibility';

describe('isAutoAnalyzeEligible', () => {
  it('is true for corporate_legal', () => {
    expect(isAutoAnalyzeEligible('corporate_legal')).toBe(true);
  });
  it('is true for commercial', () => {
    expect(isAutoAnalyzeEligible('commercial')).toBe(true);
  });
  it('is false for financial', () => {
    expect(isAutoAnalyzeEligible('financial')).toBe(false);
  });
  it('is false for unknown strings', () => {
    expect(isAutoAnalyzeEligible('whatever')).toBe(false);
  });
  it('exposes the allowed set', () => {
    expect(AUTO_ANALYZE_CATEGORIES).toEqual(['corporate_legal', 'commercial']);
  });
});
