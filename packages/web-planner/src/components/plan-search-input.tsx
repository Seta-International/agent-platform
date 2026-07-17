import { Input } from '@seta/shared-ui';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function PlanSearchInput({ value, onChange, placeholder = 'Search tasks…' }: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [prevPropValue, setPrevPropValue] = useState(value);
  // True while an IME composition is in progress (Vietnamese Telex/VNI, CJK, …).
  // Overwriting or propagating the value mid-composition corrupts the IME buffer
  // — e.g. "điện thoại" becomes "đđiệênn thoaii".
  const [isComposing, setIsComposing] = useState(false);

  // Sync prop value to local state if changed from outside (e.g. cleared by parent).
  // Never mid-composition: replacing the input value while the IME is assembling a
  // character breaks the composition.
  if (value !== prevPropValue && !isComposing) {
    setPrevPropValue(value);
    setLocalValue(value);
  }

  // Debounce: fire onChange 250ms after the last keystroke. Suspended during
  // composition so a half-formed query is never searched nor echoed back into the
  // field — that echo is what corrupted the Vietnamese input.
  useEffect(() => {
    if (isComposing) return;
    if (localValue === value) return;
    const timer = setTimeout(() => {
      onChange(localValue);
    }, 250);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange, isComposing]);

  return (
    <Input
      label="Search tasks in this plan"
      isLabelHidden
      size="sm"
      width={240}
      startIcon={<Search className="size-3.5" aria-hidden="true" />}
      hasClear
      value={localValue}
      placeholder={placeholder}
      onChange={(v) => {
        setLocalValue(v);
        // Clearing is a discrete action, not typing — propagate it past the debounce.
        if (v === '') onChange('');
      }}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={(e) => {
        setIsComposing(false);
        // Capture the finalized composition; clearing isComposing resumes the
        // debounce effect, which then propagates the committed value.
        // TextInput extends BaseProps<HTMLElement>, so currentTarget needs narrowing.
        setLocalValue((e.currentTarget as HTMLInputElement).value);
      }}
    />
  );
}
