import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';

export interface FilterPillOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T | null;
  options: ReadonlyArray<FilterPillOption<T>>;
  onChange: (next: T | null) => void;
  anyLabel?: string;
}

export function FilterPill<T extends string>({
  label,
  value,
  options,
  onChange,
  anyLabel = 'Any',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="h-7 gap-1">
          <span className="text-ink-muted">{label}</span>
          {selected ? <span className="font-medium">{selected.label}</span> : null}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          {anyLabel}
          {value == null ? <Check className="h-3 w-3" /> : null}
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            {o.label}
            {value === o.value ? <Check className="h-3 w-3" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
