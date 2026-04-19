import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'x' } });
vi.mock('resend', () => ({ Resend: vi.fn(function () { return { emails: { send: mockSend } }; }) }));

import { sendEmail } from './send';

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test';
  vi.clearAllMocks();
});

describe('sendEmail CRLF sanitisation', () => {
  it('strips CRLF from subject before sending', async () => {
    await sendEmail({ to: 'u@x.com', subject: 'hi\r\nBcc: evil@x.com', react: null as any });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ subject: 'hiBcc: evil@x.com' }));
  });

  it('refuses to send when `to` contains CRLF', async () => {
    await expect(
      sendEmail({ to: 'u@x.com\r\nBcc: y@z.com', subject: 's', react: null as any })
    ).rejects.toThrow(/invalid recipient/i);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
