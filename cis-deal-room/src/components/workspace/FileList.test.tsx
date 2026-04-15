import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FileList } from './FileList';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const previewableRow = {
  id: 'f1',
  name: 'CIM.pdf',
  sizeBytes: 1234,
  mimeType: 'application/pdf',
  version: 1,
  uploadedByEmail: 'a@b.com',
  uploadedByFirstName: 'A',
  uploadedByLastName: 'B',
  createdAt: new Date().toISOString(),
};
const unsupportedRow = {
  ...previewableRow,
  id: 'f2',
  name: 'doc.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function mockFilesResponse(files: unknown[]) {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify(files), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('FileList preview icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
  });

  it('renders a preview icon button on rows with supported MIME types', async () => {
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
  });

  it('does not render the preview icon on unsupported MIME types', async () => {
    mockFilesResponse([unsupportedRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(unsupportedRow.name);
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
  });

  it('hides the preview icon below 1024px viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 900 });
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
  });

  it('opens the preview modal when the eye icon is clicked', async () => {
    mockFilesResponse([previewableRow]);
    render(<FileList workspaceId="w1" folderId="fd1" folderName="F" isAdmin={false} onUpload={() => {}} />);
    await screen.findByText(previewableRow.name);
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
