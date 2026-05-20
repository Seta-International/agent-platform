export const SORT_ORDER_STEP = 1_000_000;
export const SORT_ORDER_REBALANCE_THRESHOLD = 100;

/**
 * Compute the sort_order to use for a new item placed AFTER `after`.
 * `next` is the sort_order of the item that would come right after the
 * new position (or undefined if appending at the end).
 *
 * If after === undefined: prepend before all.
 * If next === undefined: append after all (or use SORT_ORDER_STEP if list is empty).
 */
export function placeAfter(after: number | undefined, next: number | undefined): number {
  if (after === undefined && next === undefined) return SORT_ORDER_STEP;
  if (after === undefined) return Math.floor((0 + (next as number)) / 2);
  if (next === undefined) return after + SORT_ORDER_STEP;
  return Math.floor((after + next) / 2);
}

/**
 * Check whether the gap between two sort_order values is below the
 * rebalance threshold (signals the caller to redistribute).
 */
export function needsRebalance(a: number, b: number): boolean {
  return Math.abs(b - a) < SORT_ORDER_REBALANCE_THRESHOLD;
}

/**
 * Compute fresh sort_order values for `count` items, spaced by SORT_ORDER_STEP.
 * Returns [step, 2*step, 3*step, ...].
 */
export function rebalancedOrders(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * SORT_ORDER_STEP);
}
