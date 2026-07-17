import { Selector } from '@seta/shared-ui';
import type { GroupBy } from '../state/url-state';

interface Props {
  value: GroupBy;
  onChange: (v: GroupBy) => void;
}

export function GridGroupBySelector({ value, onChange }: Props) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-body-sm text-ink-subtle">
      Grouped by{' '}
      <Selector
        label="Group by"
        isLabelHidden
        size="sm"
        width="7rem"
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
