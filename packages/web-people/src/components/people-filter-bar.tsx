import {
  createStaticSource,
  type SearchableItem,
  Tokenizer,
  useSeededItems,
} from '@seta/shared-ui';
import { useMemo } from 'react';
import {
  projectSearch,
  searchAccounts,
  searchSkills,
  type WorkersQuery,
} from '../api/people-client.ts';

const STATUS_OPTIONS: SearchableItem[] = [
  { id: 'preboarding', label: 'Preboarding' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'probation', label: 'Probation' },
  { id: 'active', label: 'Active' },
  { id: 'on_leave', label: 'On leave' },
  { id: 'offboarding', label: 'Offboarding' },
  { id: 'alumni', label: 'Alumni' },
  { id: 'did_not_start', label: 'Did not start' },
];

const STATUS_SOURCE = createStaticSource(STATUS_OPTIONS);

interface Props {
  query: WorkersQuery;
  onChange: (patch: Partial<WorkersQuery>) => void;
}

export function PeopleFilterBar({ query, onChange }: Props) {
  const statusItems = useMemo(
    () => STATUS_OPTIONS.filter((o) => (query.status ?? []).includes(o.id)),
    [query.status],
  );

  const [accountItems, setAccountItems] = useSeededItems(
    query.account_id ?? [],
    searchAccounts.seed,
  );

  // Project suggestions are scoped to the selected accounts; rebind the source whenever the
  // account selection changes so cascading stays correct (persisted ids still resolve via the
  // unscoped `seed`, since a selection was already account-scoped when it was made).
  const projectSource = useMemo(() => projectSearch.source(query.account_id), [query.account_id]);
  const [projectItems, setProjectItems] = useSeededItems(
    query.project_id ?? [],
    projectSearch.seed,
  );

  const [techstackItems, setTechstackItems] = useSeededItems(
    query.skill_id ?? [],
    searchSkills.seed,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tokenizer
        label="Status"
        isLabelHidden
        searchSource={STATUS_SOURCE}
        debounceMs={0}
        hasEntriesOnFocus
        value={statusItems}
        onChange={(items) =>
          onChange({ status: items.length ? items.map((i) => i.id) : undefined })
        }
        placeholder="Status"
        className="w-40"
      />
      <Tokenizer
        label="Account"
        isLabelHidden
        searchSource={searchAccounts.source}
        hasEntriesOnFocus
        value={accountItems}
        onChange={(items) => {
          setAccountItems(items);
          onChange({
            account_id: items.length ? items.map((i) => i.id) : undefined,
            project_id: undefined,
          });
        }}
        placeholder="Account"
        className="w-44"
      />
      <Tokenizer
        label="Project"
        isLabelHidden
        searchSource={projectSource}
        hasEntriesOnFocus
        value={projectItems}
        onChange={(items) => {
          setProjectItems(items);
          onChange({ project_id: items.length ? items.map((i) => i.id) : undefined });
        }}
        placeholder="Project"
        className="w-44"
      />
      <Tokenizer
        label="Techstack"
        isLabelHidden
        searchSource={searchSkills.source}
        hasEntriesOnFocus
        value={techstackItems}
        onChange={(items) => {
          setTechstackItems(items);
          onChange({ skill_id: items.length ? items.map((i) => i.id) : undefined });
        }}
        placeholder="Techstack"
        className="w-44"
      />
    </div>
  );
}
