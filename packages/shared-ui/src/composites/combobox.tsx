'use client';

import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { cn } from '../lib/cn';
import { Badge } from '../primitives/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';

export type ComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Extra terms the search should match against, beyond the label. */
  keywords?: string[];
};

type BaseProps = {
  options: ComboboxOption[];
  placeholder?: string;
  /** Show the search input (default true). Set false for a plain pick-list. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Width/layout classes for the trigger. */
  className?: string;
  /** When provided, built-in filtering is disabled — the consumer filters `options` (async/remote search). */
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  'aria-label'?: string;
  triggerPrefix?: string;
  /**
   * Set when rendered inside a modal Dialog/Sheet: a non-modal Popover loses the
   * focus fight with the dialog's FocusScope and dismisses as soon as it opens.
   */
  modal?: boolean;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
  /** Cap chips shown in the trigger before collapsing to "+N". */
  maxChips?: number;
};

export type ComboboxProps = SingleProps | MultiProps;

const triggerCls =
  'flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-hairline-strong bg-canvas px-2.5 py-1 text-body-sm text-ink transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_var(--color-primary-tint)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = 'Select…',
    searchable = true,
    searchPlaceholder = 'Search…',
    emptyText = 'No results',
    disabled,
    className,
    onSearchChange,
    loading,
    modal,
  } = props;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const multiple = props.multiple === true;
  const selected = multiple ? props.value : props.value ? [props.value] : ([] as string[]);
  const selectedSet = new Set(selected);
  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;

  function commit(open_: boolean) {
    setOpen(open_);
    if (!open_) setSearch('');
  }

  function toggle(value: string) {
    if (multiple) {
      const next = selectedSet.has(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      props.onChange(next);
    } else {
      props.onChange(selectedSet.has(value) ? null : value);
      commit(false);
    }
  }

  function remove(value: string) {
    if (multiple) props.onChange(selected.filter((v) => v !== value));
  }

  const maxChips = multiple ? props.maxChips : undefined;
  const shownChips = maxChips != null ? selected.slice(0, maxChips) : selected;
  const overflow = selected.length - shownChips.length;

  function onTriggerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit(true);
    }
  }

  return (
    <Popover open={open} onOpenChange={commit} modal={modal}>
      <PopoverTrigger asChild disabled={disabled}>
        {multiple && !props.triggerPrefix ? (
          <div
            role="combobox"
            aria-expanded={open}
            aria-label={props['aria-label']}
            tabIndex={disabled ? -1 : 0}
            data-disabled={disabled ? '' : undefined}
            className={cn(triggerCls, 'flex-wrap', className)}
            onKeyDown={onTriggerKeyDown}
          >
            {selected.length === 0 ? (
              <span className="truncate text-ink-subtle">{placeholder}</span>
            ) : (
              <span className="flex flex-1 flex-wrap items-center gap-1">
                {shownChips.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1 pr-1">
                    {labelOf(v)}
                    <button
                      type="button"
                      aria-label={`Remove ${labelOf(v)}`}
                      className="rounded-full text-ink-muted hover:text-ink"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        remove(v);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {overflow > 0 && <span className="text-caption text-ink-subtle">+{overflow}</span>}
              </span>
            )}
            <ChevronsUpDown className="text-ink-subtle" />
          </div>
        ) : (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={props['aria-label']}
            className={cn(triggerCls, className)}
          >
            <span className={cn('truncate', selected.length === 0 && 'text-ink-subtle')}>
              {multiple
                ? selected.length === 0
                  ? placeholder
                  : selected.length === 1
                    ? `${props.triggerPrefix}: ${labelOf(selected[0] ?? '')}`
                    : `${props.triggerPrefix}: ${selected.length} Selected`
                : selected[0]
                  ? labelOf(selected[0])
                  : placeholder}
            </span>
            <ChevronsUpDown className="text-ink-subtle" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={!onSearchChange}>
          {searchable && (
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                onSearchChange?.(v);
              }}
            />
          )}
          <CommandList>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-ink-subtle" />
              </div>
            ) : (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label, ...(o.keywords ?? [])]}
                  disabled={o.disabled}
                  onSelect={() => toggle(o.value)}
                >
                  <Check className={cn(selectedSet.has(o.value) ? 'opacity-100' : 'opacity-0')} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
