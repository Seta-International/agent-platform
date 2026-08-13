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
  /** Session holds people.performance.read_org — adds an explicit "Organization" option. */
  canViewOrg: boolean;
  resolved: ResolvedPerformanceScope;
  onSelect: (c: PerformanceCapacity) => void;
  onSelectOrg: () => void;
};

/**
 * Top-bar project-context switcher (SCR-02). Lists the principal's capacities plus,
 * for an org-viewer (PMO/BoD/HR), an explicit "Organization" option. A single option
 * renders as read-only text; two or more render the Selector. Org mode is always a
 * deliberate choice here — never a silent fallback for a capacity-less user (FUT-781).
 */
export function ProjectContextSwitcher({
  capacities,
  canViewOrg,
  resolved,
  onSelect,
  onSelectOrg,
}: ProjectContextSwitcherProps) {
  const options = [
    ...capacities.map((c) => ({ value: capacityOptionId(c), label: capacityLabel(c) })),
    ...(canViewOrg ? [{ value: ORG_VALUE, label: 'Organization' }] : []),
  ];

  // Capacity-less and no org access: nothing to switch to. Keep the mount point stable
  // but render nothing selectable — a capacity-less non-viewer must not see the org view.
  if (options.length === 0) {
    return <span data-testid="performance-context-switcher" />;
  }

  const value =
    resolved.mode === 'capacity' && resolved.capacity
      ? capacityOptionId(resolved.capacity)
      : ORG_VALUE;

  if (options.length === 1) {
    return (
      <Text size="sm" weight="medium" data-testid="performance-context-switcher">
        {options[0]?.label ?? 'Capacity'}
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
          if (next === ORG_VALUE) {
            onSelectOrg();
            return;
          }
          const match = capacities.find((c) => capacityOptionId(c) === next);
          if (match) onSelect(match);
        }}
      />
    </div>
  );
}
