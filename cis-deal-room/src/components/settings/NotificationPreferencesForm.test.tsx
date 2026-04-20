import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => mockFetch(input, init),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { NotificationPreferencesForm } from './NotificationPreferencesForm';

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('NotificationPreferencesForm', () => {
  it('renders both toggles reflecting the initial values', () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={false}
        initialNotifyDigest={true}
      />
    );
    const uploads = screen.getByLabelText(/email me when files are uploaded/i) as HTMLInputElement;
    const digest = screen.getByLabelText(/daily digest/i) as HTMLInputElement;
    expect(uploads.checked).toBe(false);
    expect(digest.checked).toBe(true);
  });

  it('POSTs notifyUploads when the uploads toggle is flipped', async () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={false}
        initialNotifyDigest={false}
      />
    );
    const uploads = screen.getByLabelText(/email me when files are uploaded/i);
    fireEvent.click(uploads);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/user/preferences');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ notifyUploads: true });
  });

  it('POSTs notifyDigest when the digest toggle is flipped', async () => {
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={true}
        initialNotifyDigest={false}
      />
    );
    const digest = screen.getByLabelText(/daily digest/i);
    fireEvent.click(digest);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({ notifyDigest: true });
  });

  it('reverts optimistic state when the POST fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={true}
        initialNotifyDigest={false}
      />
    );
    const uploads = screen.getByLabelText(/email me when files are uploaded/i) as HTMLInputElement;
    fireEvent.click(uploads);
    expect(uploads.checked).toBe(false); // optimistic flip
    await waitFor(() => expect(uploads.checked).toBe(true)); // reverted after !ok
  });

  it('ignores a second click on the same toggle while the first POST is in flight', async () => {
    let resolveFirst: (value: { ok: boolean; json: () => Promise<object> }) => void = () => {};
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    render(
      <NotificationPreferencesForm
        initialNotifyUploads={false}
        initialNotifyDigest={false}
      />
    );
    const uploads = screen.getByLabelText(/email me when files are uploaded/i);
    fireEvent.click(uploads);
    fireEvent.click(uploads); // second click while first is in flight
    expect(mockFetch).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});
