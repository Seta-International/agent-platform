import { Button, MultiSelector, type SelectorOptionData } from '@seta/shared-ui';
import type { BoardFilters } from '../state/url-state';

interface Props {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  assigneeOptions: ReadonlyArray<SelectorOptionData>;
  labelOptions: ReadonlyArray<SelectorOptionData>;
}

export function PlanFilterBar({ filters, onChange, assigneeOptions, labelOptions }: Props) {
  const totalActive = filters.assignee_ids.length + filters.label_ids.length;
  return (
    <div className="flex items-center gap-2">
      <MultiSelector
        label="Assignee"
        isLabelHidden
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
        label="Label"
        isLabelHidden
        placeholder="Label"
        hasClear
        hasSearch
        searchPlaceholder="Search labels…"
        triggerDisplay="count"
        options={labelOptions}
        value={filters.label_ids}
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
