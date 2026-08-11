import { HStack, Selector, Text } from '@seta/shared-ui';
import { useMemo } from 'react';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';

function monthValue(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The last `back + 1` cycle months (newest first), anchored on a FIXED reference
 * month (the current cycle) — never on the current selection. Anchoring on the
 * selection would slide the whole window on every pick, so a chosen month keeps
 * jumping to a new position; a fixed anchor keeps every option in place and only
 * moves the highlight. The `selected` month is folded in when it falls outside
 * the window (e.g. a pinned historical cycle) so it stays selectable.
 */
function monthOptions(
  anchor: string,
  selected: string,
  back = 11,
): { value: string; label: string }[] {
  const parts = anchor.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const values: string[] = [];
  for (let i = 0; i <= back; i += 1) values.push(monthValue(y, m - 1 - i));
  if (!values.includes(selected)) {
    values.push(selected);
    // Keep newest-first ordering after folding the outlier in.
    values.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }
  return values.map((value) => ({ value, label: formatPerformanceMonth(value) }));
}

/**
 * Cycle-month picker shared by the shell chrome across every capacity.
 * `anchor` is the fixed current cycle (`as_of_month`); `month` is the selection.
 */
export function CyclePeriodSelector({
  anchor,
  month,
  onChange,
}: {
  anchor: string;
  month: string;
  onChange: (month: string) => void;
}) {
  const options = useMemo(() => monthOptions(anchor, month), [anchor, month]);
  return (
    <HStack gap={2} vAlign="center" data-testid="performance-period-selector">
      <Text size="sm" color="secondary">
        Cycle period
      </Text>
      <Selector
        label="Cycle period"
        isLabelHidden
        size="sm"
        value={month}
        options={options}
        onChange={onChange}
      />
    </HStack>
  );
}
