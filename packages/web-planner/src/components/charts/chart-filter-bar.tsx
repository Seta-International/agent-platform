import { MultiSelector, type SelectorOptionData } from '@seta/shared-ui';
import type { ChartFiltersState } from '../../state/chart-url-state';

const PRIORITY_OPTIONS: ReadonlyArray<SelectorOptionData> = [
  { value: '1', label: 'Urgent' },
  { value: '3', label: 'Important' },
  { value: '5', label: 'Medium' },
  { value: '9', label: 'Low' },
];

const STATUS_OPTIONS: ReadonlyArray<SelectorOptionData> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

interface Props {
  filters: ChartFiltersState;
  onChange: (next: ChartFiltersState) => void;
  assigneeOptions: ReadonlyArray<SelectorOptionData>;
  bucketOptions: ReadonlyArray<SelectorOptionData>;
}

export function ChartFilterBar({ filters, onChange, assigneeOptions, bucketOptions }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelector
        label="Assignee"
        isLabelHidden
        size="sm"
        placeholder="Assignee"
        hasClear
        hasSearch
        searchPlaceholder="Search assignees…"
        triggerDisplay="count"
        options={assigneeOptions}
        value={filters.assignee_ids}
        onChange={(next) => onChange({ ...filters, assignee_ids: next })}
      />
      <MultiSelector
        label="Bucket"
        isLabelHidden
        size="sm"
        placeholder="Bucket"
        hasClear
        hasSearch
        searchPlaceholder="Search buckets…"
        triggerDisplay="count"
        options={bucketOptions}
        value={filters.bucket_ids}
        onChange={(next) => onChange({ ...filters, bucket_ids: next })}
      />
      <MultiSelector
        label="Priority"
        isLabelHidden
        size="sm"
        placeholder="Priority"
        hasClear
        triggerDisplay="count"
        options={PRIORITY_OPTIONS}
        value={filters.priorities.map(String)}
        onChange={(next) =>
          onChange({ ...filters, priorities: next.map(Number) as ChartFiltersState['priorities'] })
        }
      />
      <MultiSelector
        label="Status"
        isLabelHidden
        size="sm"
        placeholder="Status"
        hasClear
        triggerDisplay="count"
        options={STATUS_OPTIONS}
        value={filters.statuses}
        onChange={(next) =>
          onChange({ ...filters, statuses: next as ChartFiltersState['statuses'] })
        }
      />
    </div>
  );
}
