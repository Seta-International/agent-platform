import type { GroupBy } from '../state/url-state';

interface Props {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}

export function GridGroupBySelector({ value, onChange }: Props) {
  return (
    <label className="grid-group-by">
      Grouped by{' '}
      <select value={value} onChange={(e) => onChange(e.target.value as GroupBy)}>
        <option value="bucket">Bucket</option>
        <option value="assignee">Assignee</option>
        <option value="priority">Priority</option>
        <option value="due">Due</option>
        <option value="label">Label</option>
      </select>
    </label>
  );
}
