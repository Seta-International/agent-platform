import {
  createStaticSource,
  type SearchableItem,
  Tokenizer,
  type TokenizerChange,
  useSeededItems,
} from '@seta/shared-ui';
import { useCallback, useMemo, useRef } from 'react';
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

function useTokenizerReopen() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<{ focus(): void; blur(): void }>(null);

  const triggerReopen = useCallback(() => {
    setTimeout(() => {
      if (fieldRef.current?.contains(document.activeElement)) {
        controlRef.current?.blur();
        controlRef.current?.focus();
      }
    }, 0);
  }, []);

  return { fieldRef, controlRef, triggerReopen };
}

export function PeopleFilterBar({ query, onChange }: Props) {
  const statusControl = useTokenizerReopen();
  const accountControl = useTokenizerReopen();
  const projectControl = useTokenizerReopen();
  const techstackControl = useTokenizerReopen();

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

  const handleStatusChange = useCallback(
    (items: SearchableItem[], change: TokenizerChange<SearchableItem>) => {
      onChange({ status: items.length ? items.map((i) => i.id) : undefined });
      if (change?.type === 'remove' || change?.type === 'add') {
        statusControl.triggerReopen();
      }
    },
    [onChange, statusControl.triggerReopen],
  );

  const handleAccountChange = useCallback(
    (items: SearchableItem[], change: TokenizerChange<SearchableItem>) => {
      setAccountItems(items);
      onChange({
        account_id: items.length ? items.map((i) => i.id) : undefined,
        project_id: undefined,
      });
      if (change?.type === 'remove' || change?.type === 'add') {
        accountControl.triggerReopen();
      }
    },
    [setAccountItems, onChange, accountControl.triggerReopen],
  );

  const handleProjectChange = useCallback(
    (items: SearchableItem[], change: TokenizerChange<SearchableItem>) => {
      setProjectItems(items);
      onChange({ project_id: items.length ? items.map((i) => i.id) : undefined });
      if (change?.type === 'remove' || change?.type === 'add') {
        projectControl.triggerReopen();
      }
    },
    [setProjectItems, onChange, projectControl.triggerReopen],
  );

  const handleTechstackChange = useCallback(
    (items: SearchableItem[], change: TokenizerChange<SearchableItem>) => {
      setTechstackItems(items);
      onChange({ skill_id: items.length ? items.map((i) => i.id) : undefined });
      if (change?.type === 'remove' || change?.type === 'add') {
        techstackControl.triggerReopen();
      }
    },
    [setTechstackItems, onChange, techstackControl.triggerReopen],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tokenizer
        key={`status-${(query.status ?? []).join(',')}`}
        ref={statusControl.fieldRef}
        handleRef={statusControl.controlRef}
        label="Status"
        isLabelHidden
        searchSource={STATUS_SOURCE}
        debounceMs={0}
        hasEntriesOnFocus
        value={statusItems}
        onChange={handleStatusChange}
        placeholder="Status"
        className="w-40"
      />
      <Tokenizer
        key={`account-${(query.account_id ?? []).join(',')}`}
        ref={accountControl.fieldRef}
        handleRef={accountControl.controlRef}
        label="Account"
        isLabelHidden
        searchSource={searchAccounts.source}
        hasEntriesOnFocus
        value={accountItems}
        onChange={handleAccountChange}
        placeholder="Account"
        className="w-44"
      />
      <Tokenizer
        key={`project-${(query.project_id ?? []).join(',')}`}
        ref={projectControl.fieldRef}
        handleRef={projectControl.controlRef}
        label="Project"
        isLabelHidden
        searchSource={projectSource}
        hasEntriesOnFocus
        value={projectItems}
        onChange={handleProjectChange}
        placeholder="Project"
        className="w-44"
      />
      <Tokenizer
        key={`techstack-${(query.skill_id ?? []).join(',')}`}
        ref={techstackControl.fieldRef}
        handleRef={techstackControl.controlRef}
        label="Techstack"
        isLabelHidden
        searchSource={searchSkills.source}
        hasEntriesOnFocus
        value={techstackItems}
        onChange={handleTechstackChange}
        placeholder="Techstack"
        className="w-44"
      />
    </div>
  );
}
