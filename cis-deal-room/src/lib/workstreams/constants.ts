export const WORKSTREAM_KEYS = ['legal', 'finance', 'technology', 'hr', 'commercial'] as const;
export type WorkstreamKey = (typeof WORKSTREAM_KEYS)[number];

export interface CanonicalWorkstream {
  key: WorkstreamKey;
  name: string;
  /** Dot / label / icon-stroke color — monochrome warm-grey ramp. */
  color: string;
  /** Icon-tile background tint. */
  tileTint: string;
  description: string;
  sortOrder: number;
}

// Values come straight from the design handoff "Workstream ramp" + reference panel.
export const CANONICAL_WORKSTREAMS: readonly CanonicalWorkstream[] = [
  { key: 'legal',      name: 'Legal',      color: '#33322F', tileTint: '#ECEBE6', description: 'Contracts, corporate governance, regulatory & intellectual property', sortOrder: 0 },
  { key: 'finance',    name: 'Finance',    color: '#5C5A54', tileTint: '#EAE9E4', description: 'Audited financials, tax & accounting', sortOrder: 1 },
  { key: 'technology', name: 'Technology', color: '#84827A', tileTint: '#ECEBE6', description: 'Systems, data & security', sortOrder: 2 },
  { key: 'hr',         name: 'HR',         color: '#A8A69E', tileTint: '#EFEDE7', description: 'People, compensation & benefits', sortOrder: 3 },
  { key: 'commercial', name: 'Commercial', color: '#C7C5BD', tileTint: '#EAE9E4', description: 'Customers, pipeline & go-to-market', sortOrder: 4 },
] as const;
