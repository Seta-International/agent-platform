import { Command } from 'cmdk';
import { type CSSProperties, type KeyboardEvent, useState } from 'react';
import type { ReferenceType } from './reference-row';

export interface ClassifiedReference {
  url: string;
  type: ReferenceType;
  alias: string;
  host: string;
}

export function classifyUrl(raw: string): ClassifiedReference | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const path = u.pathname.toLowerCase();
  const ext = path.match(/\.(docx?|xlsx?|pptx?|vsdx?|one)$/)?.[1];
  let type: ReferenceType = 'web';
  if (ext?.startsWith('doc')) type = 'word';
  else if (ext?.startsWith('xls')) type = 'excel';
  else if (ext?.startsWith('ppt')) type = 'powerPoint';
  else if (ext?.startsWith('vsd')) type = 'visio';
  else if (ext === 'one') type = 'oneNote';
  else if (u.host.endsWith('sharepoint.com')) type = 'sharePoint';
  const last = u.pathname.split('/').filter(Boolean).at(-1) ?? u.host;
  const alias = decodeURIComponent(last);
  return { url: raw, type, alias, host: u.host };
}

interface Props {
  onAdd: (ref: ClassifiedReference) => void;
  suggestions?: Array<{ id: string; label: string; url: string }>;
}

export function AddReferenceCombobox({ onAdd, suggestions = [] }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
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
      <div style={inputRow}>
        <span aria-hidden="true" style={glyph}>
          ⎘
        </span>
        <Command.Input
          value={value}
          onValueChange={setValue}
          onKeyDown={onKeyDown}
          placeholder="Paste a URL to attach a reference"
          style={input}
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
