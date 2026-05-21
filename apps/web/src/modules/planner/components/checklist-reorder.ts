import type { ChecklistItemRow } from '@seta/planner';
import { generateKeyBetween } from 'fractional-indexing';

export function computeReorderHint(
  items: ChecklistItemRow[],
  sourceIndex: number,
  destinationIndex: number,
): string | null {
  if (sourceIndex === destinationIndex) return null;
  const without = items.filter((_, i) => i !== sourceIndex);
  const prev = without[destinationIndex - 1]?.order_hint ?? null;
  const next = without[destinationIndex]?.order_hint ?? null;
  return generateKeyBetween(prev, next);
}
