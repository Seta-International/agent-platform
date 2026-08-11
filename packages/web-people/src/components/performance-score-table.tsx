import { Avatar, HStack, pixel, type TableColumn, Text, VStack } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import type { PerformanceGroupAxis } from '../mock/performance-scores.ts';
import { ScoreChip } from './performance-score-bits.tsx';

/**
 * Shared column builders for the per-member / per-project score tables. Every
 * capacity dashboard renders the same middle: one score-chip column per group
 * plus a bold Total. Keeping the construction here means adding or restyling a
 * score column happens once.
 */

/** Avatar + name (+ optional trailing badge) + role — the leading identity cell. */
export function PersonCell({
  name,
  role,
  badge,
}: {
  name: string;
  role: string;
  badge?: ReactNode;
}) {
  return (
    <HStack gap={2} vAlign="center">
      <Avatar name={name} size={32} />
      <VStack gap={0}>
        <HStack gap={1.5} vAlign="center">
          <Text weight="medium" size="sm" className="leading-tight">
            {name}
          </Text>
          {badge}
        </HStack>
        <Text size="2xs" color="secondary">
          {role}
        </Text>
      </VStack>
    </HStack>
  );
}

/** One centered ScoreChip column per configured group. */
export function groupScoreColumns<T extends Record<string, unknown>>(
  groups: readonly PerformanceGroupAxis[],
  getScores: (row: T) => Record<string, number>,
  width = 116,
): TableColumn<T>[] {
  return groups.map((g) => ({
    key: g.group_id,
    header: g.name,
    align: 'center',
    width: pixel(width),
    renderCell: (row) => (
      <div className="flex justify-center">
        <ScoreChip value={getScores(row)[g.group_id] ?? null} />
      </div>
    ),
  }));
}

/** Bold two-decimal Total column. */
export function totalColumn<T extends Record<string, unknown>>(
  getTotal: (row: T) => number,
  width = 84,
): TableColumn<T> {
  return {
    key: '__total',
    header: 'Total',
    align: 'center',
    width: pixel(width),
    renderCell: (row) => (
      <Text weight="semibold" size="sm" className="tabular-nums">
        {getTotal(row).toFixed(2)}
      </Text>
    ),
  };
}
