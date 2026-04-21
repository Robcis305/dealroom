import type { ParticipantRole, CisAdvisorySide } from '@/types';

/**
 * Human-facing label for a participant role, with contextual Rep naming.
 *
 * When CIS advises the buyer, the external rep on the deal represents the
 * seller — so `seller_rep` renders as "Seller Rep". Symmetric when CIS
 * advises the seller.
 */
export function roleLabel(role: ParticipantRole, side: CisAdvisorySide): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'cis_team':
      return 'CIS Team';
    case 'client':
      return 'Client';
    case 'counsel':
      return 'Counsel';
    case 'buyer_rep':
      return 'Buyer Rep';
    case 'seller_rep':
      return 'Seller Rep';
    case 'view_only':
      return 'View Only';
    case 'seller_counsel':
      return 'Seller Counsel';
    case 'buyer_counsel':
      return 'Buyer Counsel';
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/**
 * The set of roles an admin can assign when inviting or editing a participant
 * in a workspace with the given CIS advisory side. Filters out the wrong Rep
 * variant — a buy-side deal only shows Seller Rep; a sell-side deal only
 * shows Buyer Rep.
 */
export function assignableRolesFor(
  side: CisAdvisorySide
): Array<{ value: ParticipantRole; label: string }> {
  const base: ParticipantRole[] = [
    'admin',
    'cis_team',
    'client',
    'view_only',
  ];
  const rep: ParticipantRole = side === 'buyer_side' ? 'seller_rep' : 'buyer_rep';
  const counsel: ParticipantRole[] = ['seller_counsel', 'buyer_counsel'];
  return [...base, rep, ...counsel].map((value) => ({ value, label: roleLabel(value, side) }));
}
