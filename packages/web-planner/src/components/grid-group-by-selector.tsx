import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@seta/shared-ui';
import type { GroupBy } from '../state/url-state';

interface Props {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}

export function GridGroupBySelector({ value, onChange }: Props) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Radix Select trigger is a button, not a recognized form control
    <label className="grid-group-by">
      Grouped by{' '}
      <Select value={value} onValueChange={(v) => onChange(v as GroupBy)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bucket">Bucket</SelectItem>
          <SelectItem value="assignee">Assignee</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
          <SelectItem value="due">Due</SelectItem>
          <SelectItem value="label">Label</SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
}
