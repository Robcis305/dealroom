import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QnaComposer } from '@/components/workspace/QnaComposer';

describe('QnaComposer', () => {
  it('submits the typed body and disables when empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QnaComposer participants={[]} placeholder="Reply…" submitLabel="Post reply" onSubmit={onSubmit} />);
    const btn = screen.getByRole('button', { name: 'Post reply' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Reply…'), { target: { value: 'Net of reseller.' } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith('Net of reseller.');
  });
});
