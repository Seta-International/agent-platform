import {
  IconButton,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Toolbar,
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
];

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No date' },
];

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
    <Toolbar
      data-testid="my-tasks-toolbar"
      label="My tasks filters"
      size="sm"
      dividers={['bottom']}
      startContent={
        <>
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
            onChange={(v) => setLocalSearch(v)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(e) => {
              setIsComposing(false);
              setLocalSearch((e.currentTarget as HTMLInputElement).value);
            }}
          />
          <Selector
            label="Plan"
            isLabelHidden
            size="sm"
            placeholder="Plan"
            hasClear
            hasSearch
            searchPlaceholder="Search plans…"
            options={planOptions.map((p) => ({ value: p.id, label: p.name }))}
            value={value.planId ?? null}
            onChange={(next) => onChange({ planId: next ?? undefined })}
          />
          <Selector
            label="Group"
            isLabelHidden
            size="sm"
            placeholder="Group"
            hasClear
            hasSearch
            searchPlaceholder="Search groups…"
            options={groupOptions.map((g) => ({ value: g.id, label: g.name }))}
            value={value.groupId ?? null}
            onChange={(next) => onChange({ groupId: next ?? undefined })}
          />
          <Selector
            label="Priority"
            isLabelHidden
            size="sm"
            placeholder="Priority"
            hasClear
            options={PRIORITY_OPTIONS}
            value={value.priority !== undefined ? String(value.priority) : null}
            onChange={(next) => {
              if (next === null) {
                onChange({ priority: undefined });
                return;
              }
              const n = Number(next);
              if (n === 1 || n === 3 || n === 5 || n === 9) onChange({ priority: n });
            }}
          />
          <Selector
            label="Due"
            isLabelHidden
            size="sm"
            placeholder="Due"
            hasClear
            options={DUE_OPTIONS}
            value={value.due ?? null}
            onChange={(next) =>
              onChange({ due: (next as MyTasksToolbarValue['due']) ?? undefined })
            }
          />
        </>
      }
      endContent={
        <>
          <SegmentedControl
            label="View"
            value={value.view}
            onChange={(next) => onChange({ view: next as MyTasksToolbarValue['view'] })}
          >
            {VIEW_OPTIONS.map((o) => (
              <SegmentedControlItem key={o.value} value={o.value} label={o.label} icon={o.icon} />
            ))}
          </SegmentedControl>
          <IconButton
            variant="ghost"
            size="sm"
            label="More toolbar options"
            icon={<MoreHorizontal className="size-4" />}
          />
        </>
      }
    />
  );
}
