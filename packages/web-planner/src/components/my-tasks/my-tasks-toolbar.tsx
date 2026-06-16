import { FilterPill, Input, SegmentedControl } from '@seta/shared-ui';
import { LayoutGrid, List, MoreHorizontal, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface PlanOption {
  id: string;
  name: string;
}

export interface MyTasksToolbarValue {
  planId?: string;
  groupId?: string;
  priority?: 1 | 3 | 5 | 9;
  due?: 'this_week' | 'overdue' | 'no_date';
  view: 'list' | 'grid';
  search?: string;
}

interface Props {
  value: MyTasksToolbarValue;
  planOptions: ReadonlyArray<PlanOption>;
  groupOptions: ReadonlyArray<PlanOption>;
  onChange: (patch: Partial<MyTasksToolbarValue>) => void;
  /** Fires after a debounce of search input keystrokes. */
  onSearchChange: (next: string) => void;
  searchDebounceMs?: number;
}

const PRIORITY_OPTIONS = [
  { value: '1', label: 'Urgent' },
  { value: '3', label: 'Important' },
  { value: '5', label: 'Medium' },
  { value: '9', label: 'Low' },
] as const;

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No date' },
] as const;

const VIEW_OPTIONS = [
  {
    value: 'list' as const,
    label: 'List',
    icon: <List className="size-3.5" />,
    ariaLabel: 'List view',
  },
  {
    value: 'grid' as const,
    label: 'Grid',
    icon: <LayoutGrid className="size-3.5" />,
    ariaLabel: 'Grid view',
  },
];

export function MyTasksToolbar({
  value,
  planOptions,
  groupOptions,
  onChange,
  onSearchChange,
  searchDebounceMs = 250,
}: Props) {
  const [localSearch, setLocalSearch] = useState(value.search ?? '');
  const initial = useRef(true);

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const t = setTimeout(() => onSearchChange(localSearch), searchDebounceMs);
    return () => clearTimeout(t);
  }, [localSearch, onSearchChange, searchDebounceMs]);

  return (
    <div
      data-testid="my-tasks-toolbar"
      className="flex items-center gap-2 border-b border-hairline py-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <FilterPill
          label="Plan"
          value={value.planId ?? null}
          options={planOptions.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(next) => onChange({ planId: next ?? undefined })}
        />
        <FilterPill
          label="Group"
          value={value.groupId ?? null}
          options={groupOptions.map((g) => ({ value: g.id, label: g.name }))}
          onChange={(next) => onChange({ groupId: next ?? undefined })}
        />
        <FilterPill
          label="Priority"
          value={value.priority !== undefined ? String(value.priority) : null}
          options={PRIORITY_OPTIONS}
          onChange={(next) => {
            if (next === null) {
              onChange({ priority: undefined });
              return;
            }
            const n = Number(next);
            if (n === 1 || n === 3 || n === 5 || n === 9) onChange({ priority: n });
          }}
        />
        <FilterPill
          label="Due"
          value={value.due ?? null}
          options={DUE_OPTIONS}
          onChange={(next) => onChange({ due: next ?? undefined })}
        />

        <span aria-hidden="true" className="mx-1 h-5 border-l border-hairline" />

        <SegmentedControl
          aria-label="View"
          value={value.view}
          onValueChange={(next) => onChange({ view: next })}
          options={VIEW_OPTIONS}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative w-56">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            placeholder="Search my tasks"
            aria-label="Search my tasks"
            size="sm"
            className="pl-7"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          aria-label="More toolbar options"
          className="inline-flex size-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-ink"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
