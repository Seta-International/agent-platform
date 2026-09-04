import { Spinner, Text, VStack } from '@seta/shared-ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { PerformanceRollup } from '../api/people-client.ts';

/**
 * Loading / error shell shared by every dashboard, so each one only ever writes the
 * "I have data" branch. The empty cycle is NOT an error state — a roll-up with nothing
 * submitted is rendered by the dashboard itself, dashes and all.
 */
export function RollupBoundary({
  query,
  children,
}: {
  query: UseQueryResult<PerformanceRollup>;
  children: (rollup: PerformanceRollup) => ReactElement;
}) {
  if (query.isPending) {
    return (
      <VStack data-testid="performance-home" vAlign="center" gap={2} className="py-12">
        <Spinner />
      </VStack>
    );
  }
  if (query.isError || !query.data) {
    return (
      <VStack data-testid="performance-home" gap={1}>
        <Text color="secondary">Couldn't load this cycle's scores.</Text>
      </VStack>
    );
  }
  return children(query.data);
}

/** The line every dashboard shows while a cycle has no submitted evaluations. */
export function CycleEmptyNote({ scored, total }: { scored: number; total: number }) {
  if (scored > 0) return null;
  return (
    <Text size="sm" color="secondary" data-testid="cycle-empty-note">
      {total === 0
        ? 'Nobody is allocated to this cycle yet, so there is nothing to score.'
        : `No evaluations have been submitted for this cycle yet — ${total} still to score.`}
    </Text>
  );
}
