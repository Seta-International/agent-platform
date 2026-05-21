import { Check, ChevronDown, X } from 'lucide-react';
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

interface MultiProps<T extends string> {
  label: string;
  values: ReadonlyArray<T>;
  options: ReadonlyArray<FilterPillOption<T>>;
  onChange: (next: T[]) => void;
  anyLabel?: string;
}

export function MultiFilterPill<T extends string>({
  label,
  values,
  options,
  onChange,
  anyLabel = 'Any',
}: MultiProps<T>) {
  const [open, setOpen] = useState(false);
  const valueSet = new Set(values);
  const active = values.length > 0;
  const summary =
    values.length === 0
      ? anyLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? values[0])
        : `${values.length} selected`;

  function toggle(v: T) {
    if (valueSet.has(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={`h-7 gap-1 ${active ? 'border-primary text-ink' : ''}`}
          aria-label={`${label} filter`}
        >
          <span className="text-ink-muted">{label}</span>
          <span className="font-medium">{summary}</span>
          {active ? (
            <button
              type="button"
              aria-label={`Clear ${label} filter`}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-surface-3"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-2 text-sm text-ink-subtle">No options.</p>
        ) : (
          options.map((o) => {
            const checked = valueSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
                onClick={() => toggle(o.value)}
              >
                <span>{o.label}</span>
                {checked ? <Check className="h-3 w-3 text-primary" /> : null}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
