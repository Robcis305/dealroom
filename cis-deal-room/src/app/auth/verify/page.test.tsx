import { describe, it, expect } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('VerifyPage /auth/verify', () => {
  it('shows "This link has expired" message when error=expired in query params', () => {
    // TODO: render with error=expired searchParam, assert expired error message
    expect(true).toBe(false);
  });

  it('shows "This link has already been used" message when error=used in query params', () => {
    // TODO: render with error=used searchParam, assert used error message
    expect(true).toBe(false);
  });

  it('shows a button to request a new link on error states', () => {
    // TODO: render with error param, assert "Request new link" button present
    expect(true).toBe(false);
  });
});
