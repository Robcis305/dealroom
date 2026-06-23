export const QNA_STATUSES = ['new', 'assigned', 'answered', 'approved'] as const;
export type QnaStatus = (typeof QNA_STATUSES)[number];

export const QNA_VISIBILITIES = ['public', 'private'] as const;
export type QnaVisibility = (typeof QNA_VISIBILITIES)[number];

export const QNA_MESSAGE_KINDS = ['message', 'proposed_answer'] as const;
export type QnaMessageKind = (typeof QNA_MESSAGE_KINDS)[number];

export const QNA_STATUS_LABEL: Record<QnaStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  answered: 'Answered',
  approved: 'Approved',
};
