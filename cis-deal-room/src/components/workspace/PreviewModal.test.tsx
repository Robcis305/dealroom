import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PreviewModal } from './PreviewModal';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children?: React.ReactNode }) => <div data-testid="pdf-document">{children}</div>,
  Page: () => <div data-testid="pdf-page" />,
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
}));
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const fixture = {
  id: 'f1',
  name: 'CIM - Project Atlas.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234567,
  version: 2,
  uploadedByEmail: 'maria@example.com',
  uploadedByFirstName: 'Maria',
  uploadedByLastName: 'Lopez',
  createdAt: new Date('2026-04-01').toISOString(),
};

describe('PreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/fake.pdf', fileName: fixture.name }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('renders nothing when open=false', () => {
    render(<PreviewModal file={fixture} open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders top bar with filename, v-chip, and size when open', async () => {
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(fixture.name)).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText(/1\.2 MB/)).toBeInTheDocument();
    // displayName may format as "Maria Lopez" or "Maria L." — both should match /Maria/
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
  });

  it('fires onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<PreviewModal file={fixture} open={true} onClose={onClose} />);
    const closeBtn = await screen.findByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('fires onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<PreviewModal file={fixture} open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a pdf document for PDF MIME', async () => {
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    await screen.findByText(fixture.name);
    expect(await screen.findByTestId('pdf-document')).toBeInTheDocument();
  });

  it('renders a <img> for image MIME', async () => {
    const image = { ...fixture, mimeType: 'image/png', name: 'scan.png' };
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/scan.png', fileName: image.name }), {
        status: 200,
      })
    );
    const { container } = render(<PreviewModal file={image} open={true} onClose={() => {}} />);
    await screen.findByText(image.name);
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('renders a <video> for video MIME', async () => {
    const video = { ...fixture, mimeType: 'video/mp4', name: 'tour.mp4' };
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://example.com/tour.mp4', fileName: video.name }), {
        status: 200,
      })
    );
    const { container } = render(<PreviewModal file={video} open={true} onClose={() => {}} />);
    await screen.findByText(video.name);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('shows 403 error state when presign returns 403', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 403 }));
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(/no longer have access/i)).toBeInTheDocument();
  });

  it('shows 404 error state when presign returns 404', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 404 }));
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
  });

  it('calls log-preview with POST after successful render', async () => {
    render(<PreviewModal file={fixture} open={true} onClose={() => {}} />);
    await screen.findByText(fixture.name);
    await vi.waitFor(() => {
      const logCall = vi.mocked(fetchWithAuth).mock.calls.find(([url]) =>
        typeof url === 'string' && url.endsWith('/log-preview')
      );
      expect(logCall).toBeTruthy();
      expect(logCall?.[1]?.method).toBe('POST');
    });
  });
});
