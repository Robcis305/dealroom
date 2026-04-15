import { describe, it, expect } from 'vitest';
import {
  getPreviewKind,
  isPreviewable,
  PREVIEW_SIZE_CAP_BYTES,
  PREVIEW_ROW_CAP,
} from '@/lib/preview';

describe('getPreviewKind', () => {
  it('returns "pdf" for application/pdf', () => {
    expect(getPreviewKind('application/pdf')).toBe('pdf');
  });

  it('returns "image" for png/jpeg/gif/webp', () => {
    expect(getPreviewKind('image/png')).toBe('image');
    expect(getPreviewKind('image/jpeg')).toBe('image');
    expect(getPreviewKind('image/gif')).toBe('image');
    expect(getPreviewKind('image/webp')).toBe('image');
  });

  it('returns "video" for mp4 and webm', () => {
    expect(getPreviewKind('video/mp4')).toBe('video');
    expect(getPreviewKind('video/webm')).toBe('video');
  });

  it('returns "sheet" for csv and xlsx', () => {
    expect(getPreviewKind('text/csv')).toBe('sheet');
    expect(getPreviewKind('application/csv')).toBe('sheet');
    expect(getPreviewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet');
  });

  it('returns null for unsupported MIME types', () => {
    expect(getPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull();
    expect(getPreviewKind('application/zip')).toBeNull();
    expect(getPreviewKind('text/plain')).toBeNull();
    expect(getPreviewKind('application/octet-stream')).toBeNull();
    expect(getPreviewKind('')).toBeNull();
    expect(getPreviewKind(null as unknown as string)).toBeNull();
    expect(getPreviewKind(undefined as unknown as string)).toBeNull();
  });
});

describe('isPreviewable', () => {
  it('returns true for supported MIMEs', () => {
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('text/csv')).toBe(true);
  });

  it('returns false for unsupported or missing MIMEs', () => {
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable('')).toBe(false);
    expect(isPreviewable(null as unknown as string)).toBe(false);
  });
});

describe('constants', () => {
  it('PREVIEW_SIZE_CAP_BYTES is 10 MB', () => {
    expect(PREVIEW_SIZE_CAP_BYTES).toBe(10 * 1024 * 1024);
  });

  it('PREVIEW_ROW_CAP is 1000', () => {
    expect(PREVIEW_ROW_CAP).toBe(1000);
  });
});
