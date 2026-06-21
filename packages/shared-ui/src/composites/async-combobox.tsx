import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox, type ComboboxOption } from './combobox';

export type EntityOption = {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string[];
};

type BaseProps = {
  search: (query: string) => Promise<EntityOption[]>;
  resolveByIds: (ids: string[]) => Promise<EntityOption[]>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export type AsyncComboboxProps =
  | (BaseProps & {
      multiple?: false;
      value: string | null;
      onChange: (value: string | null) => void;
    })
  | (BaseProps & {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
      maxChips?: number;
    });

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function toComboboxOption(o: EntityOption): ComboboxOption {
  return { value: o.value, label: o.label, keywords: o.keywords };
}

export function AsyncCombobox(props: AsyncComboboxProps): React.ReactElement {
  const { search, resolveByIds, placeholder, disabled, className } = props;
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 200);
  const [results, setResults] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, EntityOption>());
  const [tick, forceTick] = useState(0);

  // remote search (race-safe)
  useEffect(() => {
    let live = true;
    setLoading(true);
    search(debounced)
      .then((rows) => {
        if (!live) return;
        for (const r of rows) cache.current.set(r.value, r);
        setResults(rows);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [debounced, search]);

  // hydrate labels for selected ids not yet known
  const selectedIds = useMemo(
    () => (props.multiple ? props.value : props.value ? [props.value] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.multiple, props.value],
  );
  const selectedKey = [...selectedIds].sort().join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedKey is a stable string derived from selectedIds; selectedIds is read inside but intentionally omitted from deps to avoid re-running on array reference changes in multiple mode
  useEffect(() => {
    const missing = selectedIds.filter((id) => !cache.current.has(id));
    if (missing.length === 0) return;
    let live = true;
    resolveByIds(missing).then((rows) => {
      if (!live) return;
      for (const r of rows) cache.current.set(r.value, r);
      forceTick((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [selectedKey, resolveByIds]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick triggers recompute on hydration
  const options = useMemo(() => {
    const map = new Map<string, ComboboxOption>();
    for (const id of selectedIds) {
      const hit = cache.current.get(id);
      map.set(id, hit ? toComboboxOption(hit) : { value: id, label: '…' });
    }
    for (const r of results) map.set(r.value, toComboboxOption(r));
    return [...map.values()];
  }, [results, selectedIds, tick]);

  if (props.multiple) {
    return (
      <Combobox
        multiple
        value={props.value}
        onChange={props.onChange}
        maxChips={props.maxChips}
        options={options}
        onSearchChange={setQuery}
        loading={loading}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    );
  }
  return (
    <Combobox
      value={props.value}
      onChange={props.onChange}
      options={options}
      onSearchChange={setQuery}
      loading={loading}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
