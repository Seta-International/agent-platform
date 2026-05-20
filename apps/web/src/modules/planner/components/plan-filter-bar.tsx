import type { BoardFilters } from '../state/url-state';

interface Props {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
}

export function PlanFilterBar({ filters, onChange }: Props) {
  return (
    <div className="plan-filter-bar">
      <FilterChip
        label="Assignee"
        active={filters.assignee_ids.length > 0}
        valueText={
          filters.assignee_ids.length ? `${filters.assignee_ids.length} selected` : 'Anyone'
        }
        onClear={() => onChange({ ...filters, assignee_ids: [] })}
      />
      <FilterChip
        label="Label"
        active={filters.label_ids.length > 0}
        valueText={filters.label_ids.length ? `${filters.label_ids.length} selected` : 'Any'}
        onClear={() => onChange({ ...filters, label_ids: [] })}
      />
      <FilterChip
        label="Skill"
        active={filters.skill_tags.length > 0}
        valueText={filters.skill_tags.length ? `${filters.skill_tags.length} selected` : 'Any'}
        onClear={() => onChange({ ...filters, skill_tags: [] })}
      />
    </div>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  valueText: string;
  onClear: () => void;
}

function FilterChip({ label, active, valueText, onClear }: ChipProps) {
  return (
    <button
      type="button"
      className={['plan-filter-bar__chip', active && 'plan-filter-bar__chip--active']
        .filter(Boolean)
        .join(' ')}
      onClick={active ? onClear : undefined}
      aria-label={active ? `Clear ${label} filter` : `${label} filter`}
    >
      <span className="plan-filter-bar__label">{label}</span>
      <span className="plan-filter-bar__value">{valueText}</span>
    </button>
  );
}
