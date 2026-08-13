import { Selector, Text } from '@seta/shared-ui';
import type { PerformanceCapacity } from '../api/people-client.ts';
import {
  capacityLabel,
  capacityOptionId,
  type ResolvedPerformanceScope,
} from '../state/performance-scope.ts';

const ORG_VALUE = 'organization';

export type ProjectContextSwitcherProps = {
  capacities: readonly PerformanceCapacity[];
  resolved: ResolvedPerformanceScope;
  onSelect: (c: PerformanceCapacity) => void;
};

/**
 * Top-bar project-context switcher (SCR-02). Lists available capacities;
 * single capacity → read-only control still showing the label (TC-10).
 * Organization mode (PMO, no capacities) → read-only "Organization".
 */
export function ProjectContextSwitcher({
  capacities,
  resolved,
  onSelect,
}: ProjectContextSwitcherProps) {
  if (capacities.length === 0) {
    return (
      <Text size="sm" weight="medium" data-testid="performance-context-switcher">
        Organization
      </Text>
    );
  }

  const value =
    resolved.mode === 'capacity' && resolved.capacity
      ? capacityOptionId(resolved.capacity)
      : ORG_VALUE;

  const options = capacities.map((c) => ({
    value: capacityOptionId(c),
    label: capacityLabel(c),
  }));

  const readOnly = capacities.length === 1;

  if (readOnly) {
    const only = options[0];
    return (
      <Text size="sm" weight="medium" data-testid="performance-context-switcher">
        {only?.label ?? 'Capacity'}
      </Text>
    );
  }

  return (
    <div data-testid="performance-context-switcher" className="min-w-[12rem]">
      <Selector
        label="Capacity"
        isLabelHidden
        options={options}
        value={value}
        onChange={(next) => {
          const match = capacities.find((c) => capacityOptionId(c) === next);
          if (match) onSelect(match);
        }}
      />
    </div>
  );
}
