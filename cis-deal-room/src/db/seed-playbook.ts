/**
 * Source of truth for the canonical 48-item Data Room Construction Playbook.
 * Migration 0011 is a verbatim INSERT of the rows below. To revise the
 * playbook, edit this file, regenerate the SQL via `npm run playbook:gen-sql`,
 * and ship a new migration that UPSERTs the changed rows.
 */
import type { ChecklistPriority } from '@/types';

export type PlaybookCategory =
  | 'corporate_legal'
  | 'financial'
  | 'commercial'
  | 'team_hr'
  | 'ip_technical'
  | 'operations_risk';

export type DealKillerGroup =
  | 'cap_table'
  | 'eighty_three_b'
  | 'customer_coc'
  | 'ip_assignment'
  | 'revenue_bridge';

export interface PlaybookSeedItem {
  number: number;
  category: PlaybookCategory;
  name: string;
  rationale: string;
  dealKillerGroup: DealKillerGroup | null;
  defaultPriority: ChecklistPriority;
}

export const PLAYBOOK_SEED: PlaybookSeedItem[] = [
  // ─── 1. Corporate & Legal Foundations (11) ────────────────────────────────
  { number: 1, category: 'corporate_legal', name: 'Certificate of Incorporation (current, with all amendments)', rationale: 'Must reflect every share class and authorized share count to date. Mismatches with the cap table are the single most common diligence flag.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 2, category: 'corporate_legal', name: 'Bylaws and any amendments', rationale: "Reviewed for board structure, quorum requirements, and conflicts with the proposed term sheet's governance provisions.", dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 3, category: 'corporate_legal', name: 'Board minutes and consents (every meeting and written consent)', rationale: 'Investors check that every option grant, share issuance, and major decision was properly authorized. Gaps here invalidate downstream actions.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 4, category: 'corporate_legal', name: 'Stockholder consents and voting agreements', rationale: 'Confirms drag-along, ROFR, and co-sale rights. A missing signature here can stall closing for weeks.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 5, category: 'corporate_legal', name: 'Cap table (fully diluted, reconciled with Carta or equivalent)', rationale: 'Must reconcile to the share, not the percent. Every SAFE, note, warrant, and option pool must appear and tie back to a board consent.', dealKillerGroup: 'cap_table', defaultPriority: 'critical' },
  { number: 6, category: 'corporate_legal', name: 'All SAFEs, convertible notes, and warrants (signed)', rationale: 'Investors will model conversion at the new round price. Missing or unsigned versions create phantom dilution risk.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 7, category: 'corporate_legal', name: 'Stock purchase agreements for all founder and early shares', rationale: 'Verifies that founder stock was actually issued, with vesting attached. Verbal promises do not survive diligence.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 8, category: 'corporate_legal', name: '83(b) election filings with proof of mailing', rationale: "If a founder filed late or never filed, the IRS treats vested stock as taxable income at the new round's valuation. This is the single most common item that delays closing.", dealKillerGroup: 'eighty_three_b', defaultPriority: 'critical' },
  { number: 9, category: 'corporate_legal', name: 'Equity incentive plan and all amendments', rationale: 'Confirms the option pool size matches what the cap table claims and that the plan is current with state and federal compliance.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 10, category: 'corporate_legal', name: 'Option grant agreements for every employee and advisor', rationale: 'Each grant must reference a 409A valuation. Grants made without one create tax liability for the recipient and the company.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 11, category: 'corporate_legal', name: 'All 409A valuations with dates', rationale: 'A 409A older than 12 months or issued before a material event is invalid. Investors check the date against the option grant dates.', dealKillerGroup: null, defaultPriority: 'high' },

  // ─── 2. Financial Documentation (11) ──────────────────────────────────────
  { number: 12, category: 'financial', name: 'Audited or reviewed financial statements (last 2-3 years)', rationale: 'Series A and beyond expect at minimum a CPA-reviewed P&L, balance sheet, and cash flow. Unaudited founder spreadsheets are a yellow flag past Series A.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 13, category: 'financial', name: 'Monthly management accounts (last 24 months)', rationale: 'Must reconcile to annual statements within rounding. A discrepancy here suggests the founder does not control their own numbers.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 14, category: 'financial', name: 'Detailed revenue schedule by customer, by month', rationale: 'Investors test whether deck-stated ARR matches booked, contracted, and recognized revenue. Three numbers that should not differ but often do.', dealKillerGroup: 'revenue_bridge', defaultPriority: 'critical' },
  { number: 15, category: 'financial', name: 'Cohort analysis (gross and net revenue retention)', rationale: 'NRR below 100% at scale is a thesis-breaking metric for SaaS. Investors will rebuild this from raw data if you do not provide it.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 16, category: 'financial', name: 'Bookings vs. billings vs. revenue reconciliation', rationale: 'Founders who conflate these three numbers in the deck almost always get caught here. Pre-build the bridge document.', dealKillerGroup: 'revenue_bridge', defaultPriority: 'critical' },
  { number: 17, category: 'financial', name: 'Bank statements (last 24 months, all accounts)', rationale: 'Cross-checked against monthly accounts. Cash balance discrepancies are treated as evidence of poor controls.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 18, category: 'financial', name: 'Tax returns (federal and state, last 3 years)', rationale: 'Investors confirm all filings are current and that revenue on returns matches GAAP statements within explainable bounds.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 19, category: 'financial', name: 'Detailed financial model (assumptions visible and editable)', rationale: 'A locked model raises immediate suspicion. Show the formulas, the assumptions, and the sensitivity. Confidence is shown by transparency.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 20, category: 'financial', name: 'Burn rate and runway analysis', rationale: 'Investors model multiple downside scenarios. Provide them with a base, downside, and stress case so they do not invent their own.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 21, category: 'financial', name: 'Customer acquisition cost and payback period (by channel)', rationale: 'If CAC is ambiguous or only stated as a blended number, investors assume the worst channel is hiding the average.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 22, category: 'financial', name: 'Accounts receivable aging report', rationale: 'Aging beyond 90 days suggests booked revenue may not collect. Investors discount the AR for valuation purposes.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 3. Commercial & Customer (9) ─────────────────────────────────────────
  { number: 23, category: 'commercial', name: 'Top 20 customer contracts (signed PDFs)', rationale: 'Investors read termination clauses, change-of-control provisions, and exclusivity terms. Each clause is a risk vector.', dealKillerGroup: 'customer_coc', defaultPriority: 'critical' },
  { number: 24, category: 'commercial', name: 'Customer concentration analysis (revenue % by top 10)', rationale: 'Above 20% from a single customer triggers concentration risk. Above 30% can be a thesis blocker entirely.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 25, category: 'commercial', name: 'Pipeline by stage with weighted probabilities', rationale: 'Investors call your pipeline customers. Inflated stages get caught immediately and destroy trust in the rest of the data room.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 26, category: 'commercial', name: 'Master service agreements and order forms (separated)', rationale: 'Term and pricing live in different documents. Investors need both to model true contract value.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 27, category: 'commercial', name: 'Customer references list (with permission to contact)', rationale: 'Pre-warned references are a positive signal. Surprise references almost always include one bad call.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 28, category: 'commercial', name: 'Churn analysis with reason codes', rationale: 'Churn without reason codes signals you are not learning from departures. Investors view this as an unscalable business.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 29, category: 'commercial', name: 'Pricing history and discount log', rationale: 'If your blended ACV has dropped, investors want to see whether it is mix shift or pricing erosion. Two very different stories.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 30, category: 'commercial', name: 'Sales compensation plans and quota attainment', rationale: "If reps are missing quota at a 10% growth assumption, the model's 60% growth case is fiction.", dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 31, category: 'commercial', name: 'Marketing spend and attribution by channel', rationale: 'Investors will rebuild your CAC by channel. Hand them the data so they do not invent worse numbers.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 4. Team & HR (7) ─────────────────────────────────────────────────────
  { number: 32, category: 'team_hr', name: 'Org chart with reporting lines and tenure', rationale: 'Investors flag any single point of failure (one engineer who built everything, one salesperson who closes everything).', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 33, category: 'team_hr', name: 'Employee offer letters and confidentiality agreements (all)', rationale: 'Missing IP assignment language means the company may not actually own its own product. This kills deals at Series A.', dealKillerGroup: 'ip_assignment', defaultPriority: 'critical' },
  { number: 34, category: 'team_hr', name: 'Contractor agreements with IP assignment language', rationale: 'Every contractor who touched the codebase must have signed an assignment. Otherwise their work is not yours.', dealKillerGroup: 'ip_assignment', defaultPriority: 'critical' },
  { number: 35, category: 'team_hr', name: 'Employee handbook and policies', rationale: 'At Series A and beyond, investors expect formal policies for harassment, expense, and remote work. Their absence signals immaturity.', dealKillerGroup: null, defaultPriority: 'low' },
  { number: 36, category: 'team_hr', name: 'Compensation benchmarks and equity grants by role', rationale: 'Massively over- or under-paying employees is a flag. Investors check Pave or Option Impact comparables.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 37, category: 'team_hr', name: 'Founder employment agreements with vesting schedules', rationale: 'Founders without vesting are an unacceptable risk. Investors will require a re-vest as a closing condition if missing.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 38, category: 'team_hr', name: 'Termination and severance documentation for any departures', rationale: 'An unresolved separation can become a lawsuit. Get releases signed before fundraising, not during it.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 5. Intellectual Property & Technical (8) ─────────────────────────────
  { number: 39, category: 'ip_technical', name: 'Trademark, patent, and copyright registrations', rationale: 'Provides evidence the company actually owns its brand and core IP. Pending applications still count, abandoned applications are a flag.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 40, category: 'ip_technical', name: 'Open source software audit and license inventory', rationale: 'GPL or AGPL components in proprietary code can force-disclose your source. Discovered late, this can rewrite your business model.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 41, category: 'ip_technical', name: 'Architecture diagrams and technical documentation', rationale: 'Investors do a technical diligence call. Visible documentation signals a real engineering culture, not founder-dependent code.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 42, category: 'ip_technical', name: 'Security policies, SOC 2 status, and any past audit reports', rationale: 'Enterprise customers and Series B+ investors will not move forward without at least SOC 2 Type 1 in progress.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 43, category: 'ip_technical', name: 'Data processing agreements and privacy policy', rationale: 'GDPR, CCPA, and HIPAA exposure must be documented. Verbal claims of compliance get tested against the actual data flow.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 44, category: 'ip_technical', name: 'Third-party software and infrastructure vendor list', rationale: 'Investors check for single-vendor dependencies (one cloud, one data provider). Also confirms costs match the financial model.', dealKillerGroup: null, defaultPriority: 'medium' },
  { number: 45, category: 'ip_technical', name: 'Source code escrow agreements (if applicable)', rationale: 'Enterprise customers often require this. Investors check whether the obligation is current and whether the deposits are up to date.', dealKillerGroup: null, defaultPriority: 'low' },
  { number: 46, category: 'ip_technical', name: 'Any past or pending IP litigation', rationale: 'Even nuisance patent claims must be disclosed. Investors discover them through search anyway, so disclose first.', dealKillerGroup: null, defaultPriority: 'medium' },

  // ─── 6. Operations & Risk (2) ─────────────────────────────────────────────
  { number: 47, category: 'operations_risk', name: 'Insurance policies (D&O, E&O, cyber, general liability)', rationale: 'Investors require D&O insurance as a closing condition. Without it, the new directors will not take their seats.', dealKillerGroup: null, defaultPriority: 'high' },
  { number: 48, category: 'operations_risk', name: 'Real estate leases and equipment leases', rationale: 'Long-term leases are debt-equivalent. Investors model them into burn and check for unfavorable change-of-control clauses.', dealKillerGroup: null, defaultPriority: 'medium' },
];
