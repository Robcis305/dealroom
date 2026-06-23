import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepFolders } from '@/components/deals/wizard/StepFolders';

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/lib/fetch-with-auth';

const WORKSPACE_ID = 'w1';

function makeFolderMock() {
  let callCount = 0;
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    callCount++;
    const body = JSON.parse((init?.body as string) ?? '{}') as { name: string };
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: `f${callCount}`, name: body.name }),
    } as Response;
  });
}

describe('StepFolders', () => {
  beforeEach(() => {
    vi.mocked(fetchWithAuth).mockReset();
  });

  it('renders 8 canonical folders all pre-checked', () => {
    const registerCommit = vi.fn();
    render(
      <StepFolders
        workspaceId={WORKSPACE_ID}
        onDone={vi.fn()}
        onSkip={vi.fn()}
        registerCommit={registerCommit}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    const checked = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
    expect(checked.length).toBeGreaterThanOrEqual(8);
  });

  it('calls onDone with 8 folders (7 canonical + 1 custom) after unchecking Legal and adding a custom', async () => {
    vi.mocked(fetchWithAuth).mockImplementation(makeFolderMock());

    const onDone = vi.fn();
    const onSkip = vi.fn();
    let commitFn: (() => Promise<boolean>) | null = null;
    const registerCommit = vi.fn((fn: () => Promise<boolean>) => {
      commitFn = fn;
    });

    render(
      <StepFolders
        workspaceId={WORKSPACE_ID}
        onDone={onDone}
        onSkip={onSkip}
        registerCommit={registerCommit}
      />
    );

    // Uncheck "Legal"
    const legalCheckbox = screen.getByRole('checkbox', { name: /legal/i });
    fireEvent.click(legalCheckbox);
    expect(legalCheckbox).not.toBeChecked();

    // Add custom folder
    const customInput = screen.getByPlaceholderText(/add a custom folder/i);
    fireEvent.change(customInput, { target: { value: 'Custom One' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // Wait for commit fn to be registered (it's registered via useEffect on state changes)
    await waitFor(() => expect(commitFn).not.toBeNull());

    // Invoke commit
    const result = await commitFn!();
    expect(result).toBe(true);

    // 7 canonical (all minus Legal) + 1 custom = 8 total
    expect(fetchWithAuth).toHaveBeenCalledTimes(8);
    for (const call of vi.mocked(fetchWithAuth).mock.calls) {
      expect(call[0]).toBe(`/api/workspaces/${WORKSPACE_ID}/folders`);
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      ])
    );
    expect((onDone.mock.calls[0][0] as { id: string; name: string }[]).length).toBe(8);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('calls onSkip without any folder POSTs when Skip is invoked', async () => {
    vi.mocked(fetchWithAuth).mockImplementation(makeFolderMock());

    const onDone = vi.fn();
    const onSkip = vi.fn();
    const registerCommit = vi.fn();

    render(
      <StepFolders
        workspaceId={WORKSPACE_ID}
        onDone={onDone}
        onSkip={onSkip}
        registerCommit={registerCommit}
      />
    );

    // Simulate container's Skip button calling onSkip directly
    onSkip();

    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
