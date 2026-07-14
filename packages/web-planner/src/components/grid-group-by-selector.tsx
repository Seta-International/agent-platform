import { Selector } from '@seta/shared-ui';
import type { GroupBy } from '../state/url-state';

interface Props {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}

export function GridGroupBySelector({ value, onChange }: Props) {
  return (
    <span className="grid-group-by">
      Grouped by{' '}
      <Selector
        label="Group by"
        isLabelHidden
        size="sm"
        options={[
          { value: 'bucket', label: 'Bucket' },
          { value: 'assignee', label: 'Assignee' },
          { value: 'priority', label: 'Priority' },
          { value: 'due', label: 'Due' },
          { value: 'label', label: 'Label' },
        ]}
        value={value}
        onChange={(v) => onChange(v as GroupBy)}
      />
    </span>
  );
}
