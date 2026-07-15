import { Command } from 'cmdk';
import { type CSSProperties, type KeyboardEvent, useState } from 'react';
import { type ClassifiedReference, classifyUrl } from './classify-url';

interface Props {
  onAdd: (ref: ClassifiedReference) => void;
  suggestions?: Array<{ id: string; label: string; url: string }>;
  /** Renders the input inert (e.g. for users without edit permission). */
  disabled?: boolean;
}

export function AddReferenceCombobox({ onAdd, suggestions = [], disabled = false }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    if (disabled) return;
    const classified = classifyUrl(value);
    if (!classified) return;
    onAdd(classified);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Command style={shell} loop>
      <div style={disabled ? { ...inputRow, opacity: 0.5 } : inputRow}>
        <span aria-hidden="true" style={glyph}>
          ⎘
        </span>
        <Command.Input
          value={value}
          onValueChange={setValue}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Paste a URL to attach a reference"
          style={disabled ? { ...input, cursor: 'not-allowed' } : input}
        />
        <kbd style={kbd}>⌘V</kbd>
      </div>
      {suggestions.length > 0 && (
        <Command.List style={list}>
          {suggestions.map((s) => (
            <Command.Item
              key={s.id}
              value={s.label}
              onSelect={() => {
                const classified = classifyUrl(s.url);
                if (classified) onAdd(classified);
              }}
            >
              {s.label}
            </Command.Item>
          ))}
        </Command.List>
      )}
    </Command>
  );
}

const shell: CSSProperties = { width: '100%' };
const inputRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px dashed var(--color-hairline-strong)',
  background: 'transparent',
};
const glyph: CSSProperties = { color: 'var(--color-ink-subtle)', fontSize: 13 };
const input: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--color-ink)',
  fontSize: 13,
};
const kbd: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '2px 5px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 4,
  color: 'var(--color-ink-subtle)',
};
const list: CSSProperties = { marginTop: 6 };
