import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useImeComposition } from '../hooks/use-ime-composition';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function PlanSearchInput({ value, onChange, placeholder = 'Search tasks…' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Local draft so keystrokes render instantly. The `value` prop is sourced from
  // the URL `q` param via async router navigation; binding it straight to the
  // input drops characters when typing outpaces the round-trip (typing "hello"
  // lands as "o"), and is what corrupts IME composition too. [FUT-34]
  const [draft, setDraft] = useState(value);

  // Adopt external value changes (back/forward, programmatic clear) but only when
  // the user isn't actively typing, so a lagging async echo can't clobber the draft.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  const ime = useImeComposition((next) => {
    setDraft(next);
    onChange(next);
  });

  function clear() {
    setDraft('');
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div className="plan-search-input">
      <Search aria-hidden="true" className="plan-search-input__icon" />
      <input
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label="Search tasks in this plan"
        {...ime}
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="plan-search-input__clear"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
}
