import { describe, it, expect } from 'vitest';
import { QNA_STATUSES, QNA_VISIBILITIES, QNA_MESSAGE_KINDS, QNA_STATUS_LABEL } from './constants';

describe('qna constants', () => {
  it('defines the lifecycle statuses in order', () => {
    expect(QNA_STATUSES).toEqual(['new', 'assigned', 'answered', 'approved']);
  });
  it('defines visibilities and message kinds', () => {
    expect(QNA_VISIBILITIES).toEqual(['public', 'private']);
    expect(QNA_MESSAGE_KINDS).toEqual(['message', 'proposed_answer']);
  });
  it('labels every status', () => {
    for (const s of QNA_STATUSES) expect(QNA_STATUS_LABEL[s].length).toBeGreaterThan(0);
  });
});
