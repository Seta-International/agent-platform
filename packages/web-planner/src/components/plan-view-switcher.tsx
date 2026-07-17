import { SegmentedControl, SegmentedControlItem } from '@seta/shared-ui';
import { CalendarDays, ChartColumnBig, LayoutGrid, Rows3 } from 'lucide-react';
import type { ViewMode } from '../state/url-state';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

export function PlanViewSwitcher({ value, onChange }: Props) {
  return (
    <SegmentedControl
      label="View mode"
      size="sm"
      value={value}
      onChange={(v) => onChange(v as ViewMode)}
    >
      <SegmentedControlItem value="board" label="Board" icon={<LayoutGrid aria-hidden="true" />} />
      <SegmentedControlItem value="grid" label="Grid" icon={<Rows3 aria-hidden="true" />} />
      <SegmentedControlItem
        value="calendar"
        label="Calendar"
        icon={<CalendarDays aria-hidden="true" />}
      />
      <SegmentedControlItem
        value="charts"
        label="Charts"
        icon={<ChartColumnBig aria-hidden="true" />}
      />
    </SegmentedControl>
  );
}
