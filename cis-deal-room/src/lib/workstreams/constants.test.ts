import { describe, it, expect } from 'vitest';
import { WORKSTREAM_KEYS, CANONICAL_WORKSTREAMS } from './constants';

describe('canonical workstreams', () => {
  it('defines exactly the five canonical keys in order', () => {
    expect(WORKSTREAM_KEYS).toEqual(['legal', 'finance', 'technology', 'hr', 'commercial']);
  });

  it('has one canonical definition per key with required fields', () => {
    expect(CANONICAL_WORKSTREAMS).toHaveLength(5);
    for (const ws of CANONICAL_WORKSTREAMS) {
      expect(WORKSTREAM_KEYS).toContain(ws.key);
      expect(ws.name.length).toBeGreaterThan(0);
      expect(ws.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ws.tileTint).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ws.description.length).toBeGreaterThan(0);
    }
  });

  it('orders sortOrder 0..4 matching WORKSTREAM_KEYS', () => {
    const sorted = [...CANONICAL_WORKSTREAMS].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((w) => w.key)).toEqual([...WORKSTREAM_KEYS]);
  });
});
