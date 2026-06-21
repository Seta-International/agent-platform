import { AsyncCombobox, Combobox, type ComboboxOption, Input } from '@seta/shared-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  projectSearch,
  searchAccounts,
  searchSkills,
  type WorkersQuery,
} from '../api/people-client.ts';

const STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'preboarding', label: 'Preboarding' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'probation', label: 'Probation' },
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'offboarding', label: 'Offboarding' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'did_not_start', label: 'Did not start' },
];

interface Props {
  query: WorkersQuery;
  onChange: (patch: Partial<WorkersQuery>) => void;
}

export function PeopleFilterBar({ query, onChange }: Props) {
  const [searchText, setSearchText] = useState(query.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchText(query.search ?? '');
  }, [query.search]);

  function handleSearchChange(value: string) {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ search: value || undefined });
    }, 300);
  }

  // Stable per selected-accounts: AsyncCombobox lists `search` in its effect deps, so a new
  // reference each render would re-fetch projects on every unrelated parent render.
  const projectSearchBound = useMemo(
    () => ({
      search: (q: string) => projectSearch.search(q, query.account_id),
      resolveByIds: projectSearch.resolveByIds,
    }),
    [query.account_id],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-8 w-48"
        placeholder="Search people…"
        value={searchText}
        onChange={(e) => handleSearchChange(e.target.value)}
      />
      <Combobox
        multiple
        options={STATUS_OPTIONS}
        value={query.status ?? []}
        onChange={(v) => onChange({ status: v.length ? v : undefined })}
        placeholder="Status"
        className="h-8 w-40"
      />
      <AsyncCombobox
        multiple
        value={query.account_id ?? []}
        onChange={(v) => onChange({ account_id: v.length ? v : undefined, project_id: undefined })}
        search={searchAccounts.search}
        resolveByIds={searchAccounts.resolveByIds}
        placeholder="Account"
        className="h-8 w-44"
      />
      <AsyncCombobox
        multiple
        value={query.project_id ?? []}
        onChange={(v) => onChange({ project_id: v.length ? v : undefined })}
        search={projectSearchBound.search}
        resolveByIds={projectSearchBound.resolveByIds}
        placeholder="Project"
        className="h-8 w-44"
      />
      <AsyncCombobox
        multiple
        value={query.skill_id ?? []}
        onChange={(v) => onChange({ skill_id: v.length ? v : undefined })}
        search={searchSkills.search}
        resolveByIds={searchSkills.resolveByIds}
        placeholder="Techstack"
        className="h-8 w-44"
      />
    </div>
  );
}
