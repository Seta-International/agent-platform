import {
  FilterPill,
  IconButton,
  Input,
  SegmentedControl,
  SegmentedControlItem,
} from '@seta/shared-ui';
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

// Astryx's SegmentedControlItem has no per-item accessible-name override — the visible
// `label` below (paired with the container's "View" label) is the item's accessible name.
const VIEW_OPTIONS = [
  { value: 'list' as const, label: 'List', icon: <List className="size-3.5" /> },
  { value: 'grid' as const, label: 'Grid', icon: <LayoutGrid className="size-3.5" /> },
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
  // True while an IME composition is in progress (Vietnamese Telex/VNI, CJK, …).
  // Propagating the value mid-composition corrupts the IME buffer.
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (isComposing) return;
    const t = setTimeout(() => onSearchChange(localSearch), searchDebounceMs);
    return () => clearTimeout(t);
  }, [localSearch, onSearchChange, searchDebounceMs, isComposing]);

  return (
    <div
      data-testid="my-tasks-toolbar"
      className="flex items-center gap-2 border-b border-border py-2"
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

        <span aria-hidden="true" className="mx-1 h-5 border-l border-border" />

        <SegmentedControl
          label="View"
          value={value.view}
          onChange={(next) => onChange({ view: next as MyTasksToolbarValue['view'] })}
        >
          {VIEW_OPTIONS.map((o) => (
            <SegmentedControlItem key={o.value} value={o.value} label={o.label} icon={o.icon} />
          ))}
        </SegmentedControl>
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          label="Search my tasks"
          isLabelHidden
          startIcon={<Search className="size-3.5" aria-hidden />}
          hasClear
          placeholder="Search my tasks"
          size="sm"
          className="w-56"
          value={localSearch}
          onChange={(value) => setLocalSearch(value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            setLocalSearch((e.currentTarget as HTMLInputElement).value);
          }}
        />
        <IconButton
          variant="ghost"
          size="sm"
          label="More toolbar options"
          icon={<MoreHorizontal className="size-4" />}
        />
      </div>
    </div>
  );
}
