import type { AvailabilityStatus } from '../schemas.ts';

/** Status weight: ooo zeroes the score, busy is heavily penalized, available is full. */
export const STATUS_MULTIPLIER: Record<AvailabilityStatus, number> = {
  available: 1,
  busy: 0.35,
  ooo: 0,
};

/** Workload half-life in in-progress tasks: every WORKLOAD_DECAY tasks halve the factor. */
export const WORKLOAD_DECAY = 3;

/**
 * Availability score in [0,1]; higher means freer. ooo is always 0.
 *   score = STATUS_MULTIPLIER[status] * 2 ^ (-inProgressCount / WORKLOAD_DECAY)
 * Negative counts are clamped to 0 before decay.
 */
export function computeAvailabilityScore(
  status: AvailabilityStatus,
  inProgressCount: number,
): number {
  const workloadFactor = 2 ** (-Math.max(0, inProgressCount) / WORKLOAD_DECAY);
  const raw = STATUS_MULTIPLIER[status] * workloadFactor;
  return Math.min(1, Math.max(0, raw));
}
