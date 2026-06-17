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

// Mirrors the server-side ordering in get-task.ts: `ORDER BY order_hint NULLS LAST`
// with id as a stable tiebreaker. Local mutations must re-sort after touching
// order_hint, otherwise the cached array keeps its pre-drag positions even
// though the server has accepted the new hint.
export function sortChecklist<T extends Pick<ChecklistItemRow, 'id' | 'order_hint'>>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.order_hint === null && b.order_hint === null) return cmpString(a.id, b.id);
    if (a.order_hint === null) return 1;
    if (b.order_hint === null) return -1;
    return cmpString(a.order_hint, b.order_hint) || cmpString(a.id, b.id);
  });
}

function cmpString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
