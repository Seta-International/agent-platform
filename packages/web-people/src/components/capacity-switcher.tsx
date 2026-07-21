import { Selector, Text } from '@seta/shared-ui';
import type { PerformanceCapacity } from '../api/people-client.ts';
import { decodeCapacity, encodeCapacity } from '../lib/performance-scope.ts';
import { usePerformanceScope } from './performance-scope.tsx';

const KIND_LABELS: Record<PerformanceCapacity['kind'], string> = {
  am: 'AM',
  tl: 'TL',
  member: 'Member',
};

export function capacityLabel(c: PerformanceCapacity): string {
  return `${KIND_LABELS[c.kind]} · ${c.label}`;
}

/**
 * Project-context switcher (SCR-02 top bar). Selection is written to the URL
 * search params only — the scope provider reads it back, so every consumer
 * sees the same tuple (AC3/AC4). Single capacity renders read-only to avoid
 * a dropdown affordance with nothing to switch to.
 */
export function CapacitySwitcher() {
  const { context, scope, setCapacity } = usePerformanceScope();
  const { capacities } = context;

  if (capacities.length === 0 || !scope) return null;

  const current = encodeCapacity(scope.capacity);

  if (capacities.length === 1) {
    return (
      <Text size="sm" weight="medium" color="secondary">
        {capacityLabel(capacities[0]!)}
      </Text>
    );
  }

  return (
    <Selector
      label="Capacity"
      isLabelHidden
      options={capacities.map((c) => ({
        value: encodeCapacity(toCapacityRefInput(c)),
        label: capacityLabel(c),
      }))}
      value={current}
      onChange={(v) => {
        const ref = decodeCapacity(v);
        if (ref) setCapacity(ref);
      }}
    />
  );
}

function toCapacityRefInput(c: PerformanceCapacity) {
  return c.kind === 'am'
    ? ({ kind: 'am', account_id: c.account_id } as const)
    : ({ kind: c.kind, project_id: c.project_id } as const);
}
