import { Button, type FilterPillOption, MultiFilterPill } from '@seta/shared-ui';
import type { BoardFilters } from '../state/url-state';

interface Props {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  assigneeOptions: ReadonlyArray<FilterPillOption<string>>;
  labelOptions: ReadonlyArray<FilterPillOption<string>>;
}

export function PlanFilterBar({ filters, onChange, assigneeOptions, labelOptions }: Props) {
  const totalActive = filters.assignee_ids.length + filters.label_ids.length;
  return (
    <div className="plan-filter-bar">
      <MultiFilterPill
        label="Assignee"
        anyLabel="Anyone"
        values={filters.assignee_ids}
        options={assigneeOptions}
        onChange={(next) => onChange({ ...filters, assignee_ids: next })}
      />
      <MultiFilterPill
        label="Label"
        values={filters.label_ids}
        options={labelOptions}
        onChange={(next) => onChange({ ...filters, label_ids: next })}
      />
      {totalActive > 0 && (
        <Button
          variant="ghost"
          size="sm"
          label="Clear filters"
          onClick={() => onChange({ assignee_ids: [], label_ids: [] })}
        />
      )}
    </div>
  );
}
