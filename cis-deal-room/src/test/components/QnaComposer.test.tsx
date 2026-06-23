import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QnaComposer } from '@/components/workspace/QnaComposer';

describe('QnaComposer', () => {
  it('submits the typed body and disables when empty (primary only)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Chat', onSubmit }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Chat' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Reply…'), { target: { value: 'Net of reseller.' } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith('Net of reseller.');
  });

  it('both buttons disabled when empty', () => {
    const chat = vi.fn().mockResolvedValue(undefined);
    const answer = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Answer', onSubmit: answer }}
        secondary={{ label: 'Chat', onSubmit: chat }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Chat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
  });

  it('typing enables both buttons', () => {
    const chat = vi.fn().mockResolvedValue(undefined);
    const answer = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Answer', onSubmit: answer }}
        secondary={{ label: 'Chat', onSubmit: chat }}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Reply…'), { target: { value: 'Hello world' } });
    expect(screen.getByRole('button', { name: 'Chat' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Answer' })).not.toBeDisabled();
  });

  it('clicking secondary calls secondary.onSubmit(body)', async () => {
    const chat = vi.fn().mockResolvedValue(undefined);
    const answer = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Answer', onSubmit: answer }}
        secondary={{ label: 'Chat', onSubmit: chat }}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Reply…'), { target: { value: 'A discussion note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(chat).toHaveBeenCalledWith('A discussion note');
    expect(answer).not.toHaveBeenCalled();
  });

  it('clicking primary calls primary.onSubmit(body)', async () => {
    const chat = vi.fn().mockResolvedValue(undefined);
    const answer = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Answer', onSubmit: answer }}
        secondary={{ label: 'Chat', onSubmit: chat }}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Reply…'), { target: { value: 'The official answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(answer).toHaveBeenCalledWith('The official answer');
    expect(chat).not.toHaveBeenCalled();
  });

  it('box clears after successful submit', async () => {
    const answer = vi.fn().mockResolvedValue(undefined);
    render(
      <QnaComposer
        participants={[]}
        placeholder="Reply…"
        primary={{ label: 'Answer', onSubmit: answer }}
      />,
    );
    const textarea = screen.getByPlaceholderText('Reply…');
    fireEvent.change(textarea, { target: { value: 'Will this clear?' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('Will this clear?');
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('');
    });
  });
});
