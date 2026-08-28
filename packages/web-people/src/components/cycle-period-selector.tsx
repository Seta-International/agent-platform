import { HStack, Selector, Text } from '@seta/shared-ui';
import { useMemo } from 'react';
import { cyclePeriodOptions } from '../nav/cycle-period.ts';

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
  const options = useMemo(() => cyclePeriodOptions(anchor, month), [anchor, month]);
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
