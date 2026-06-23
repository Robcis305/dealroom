'use client';
import { useState, useRef } from 'react';

interface Participant {
  id: string;
  name: string;
}

interface Action {
  label: string;
  onSubmit: (body: string) => Promise<void>;
}

interface Props {
  participants: Participant[];
  placeholder: string;
  primary: Action;
  secondary?: Action;
}

/** Returns the word at the caret position (text up to caret, last token). */
function getCurrentToken(text: string, caret: number): { token: string; start: number } {
  const before = text.slice(0, caret);
  const match = before.match(/(@\S*)$/);
  if (!match) return { token: '', start: caret };
  return { token: match[1], start: caret - match[1].length };
}

export function QnaComposer({ participants, placeholder, primary, secondary }: Props) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dropdown, setDropdown] = useState<Participant[]>([]);
  const [tokenStart, setTokenStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setValue(text);

    const caret = e.target.selectionStart ?? text.length;
    const { token, start } = getCurrentToken(text, caret);

    if (token.startsWith('@') && token.length > 1) {
      const query = token.slice(1).toLowerCase();
      const matches = participants.filter((p) =>
        p.name.toLowerCase().includes(query)
      );
      setDropdown(matches);
      setTokenStart(start);
    } else if (token === '@') {
      setDropdown(participants);
      setTokenStart(start);
    } else {
      setDropdown([]);
    }
  }

  function handleSelect(participant: Participant) {
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const { token } = getCurrentToken(value, caret);
    const before = value.slice(0, tokenStart);
    const after = value.slice(tokenStart + token.length);
    const inserted = `@${participant.name} `;
    const next = before + inserted + after;
    setValue(next);
    setDropdown([]);

    // Restore focus + move caret after insertion
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = before.length + inserted.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  async function handleAction(action: Action) {
    const body = value;
    setSubmitting(true);
    try {
      await action.onSubmit(body);
      setValue('');
      setDropdown([]);
    } finally {
      setSubmitting(false);
    }
  }

  const isEmpty = value.trim() === '';

  return (
    <div className="relative flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-text-primary"
      />

      {dropdown.length > 0 && (
        <ul className="absolute top-full z-50 mt-1 max-h-48 w-56 overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {dropdown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-elevated"
                onMouseDown={(e) => {
                  // prevent textarea blur before we handle the click
                  e.preventDefault();
                  handleSelect(p);
                }}
              >
                @{p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        {secondary && (
          <button
            type="button"
            disabled={isEmpty || submitting}
            onClick={() => handleAction(secondary)}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-text-primary disabled:opacity-40"
          >
            {secondary.label}
          </button>
        )}
        <button
          type="button"
          disabled={isEmpty || submitting}
          onClick={() => handleAction(primary)}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-text-inverse disabled:opacity-40"
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
