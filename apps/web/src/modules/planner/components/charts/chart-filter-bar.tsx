import { type FilterPillOption, MultiFilterPill } from '@seta/shared-ui';
import type { ChartFiltersState } from '../../state/chart-url-state';

type PriorityValue = '1' | '3' | '5' | '9';
type StatusValue = 'not_started' | 'in_progress' | 'completed';

const PRIORITY_OPTIONS: ReadonlyArray<FilterPillOption<PriorityValue>> = [
  { value: '1', label: 'Urgent' },
  { value: '3', label: 'Important' },
  { value: '5', label: 'Medium' },
  { value: '9', label: 'Low' },
];

const STATUS_OPTIONS: ReadonlyArray<FilterPillOption<StatusValue>> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

interface Props {
  filters: ChartFiltersState;
  onChange: (next: ChartFiltersState) => void;
  assigneeOptions: ReadonlyArray<FilterPillOption<string>>;
  bucketOptions: ReadonlyArray<FilterPillOption<string>>;
}

export function ChartFilterBar({ filters, onChange, assigneeOptions, bucketOptions }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 pr-1 text-xs text-ink-subtle">
        Chart filters
        <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          independent
        </span>
      </span>
      <MultiFilterPill
        label="Assignee"
        anyLabel="Anyone"
        values={filters.assignee_ids}
        options={assigneeOptions}
        onChange={(next) => onChange({ ...filters, assignee_ids: next })}
      />
      <MultiFilterPill
        label="Bucket"
        values={filters.bucket_ids}
        options={bucketOptions}
        onChange={(next) => onChange({ ...filters, bucket_ids: next })}
      />
      <MultiFilterPill
        label="Priority"
        values={filters.priorities.map(String) as PriorityValue[]}
        options={PRIORITY_OPTIONS}
        onChange={(next) =>
          onChange({ ...filters, priorities: next.map(Number) as ChartFiltersState['priorities'] })
        }
      />
      <MultiFilterPill
        label="Status"
        values={filters.statuses}
        options={STATUS_OPTIONS}
        onChange={(next) => onChange({ ...filters, statuses: next })}
      />
    </div>
  );
}
