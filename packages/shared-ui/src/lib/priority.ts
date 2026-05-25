/**
 * Shared priority registry — the single source of truth for task priority levels,
 * labels, and colors across the app. Compose chips, dots, and icons from this module
 * rather than redeclaring values; that's how Urgent stays red and Important stays
 * orange everywhere without drift.
 *
 * Colors resolve through CSS variables defined in `styles/tokens.css`, so dark/light
 * theme switches happen automatically — never inline a hex value in a consumer.
 */

/** Stored task priority — matches `planner.tasks.priority_number` CHECK constraint. */
export type PriorityNumber = 1 | 3 | 5 | 9;

/** Symbolic priority level. */
export type PriorityLevel = 'urgent' | 'important' | 'medium' | 'low';

export interface PriorityDescriptor {
  /** The stored numeric value (1 / 3 / 5 / 9). */
  value: PriorityNumber;
  /** The symbolic level (`urgent` / `important` / `medium` / `low`). */
  level: PriorityLevel;
  /** Display label (en-US). */
  label: string;
  /** Solid color CSS variable — use for dots, icons, accents. */
  color: string;
  /** Soft tint CSS variable — use for chip backgrounds. */
  tint: string;
  /** Strong on-tint text color CSS variable — readable against `tint`. */
  ink: string;
}

export const PRIORITY_LEVELS: ReadonlyArray<PriorityDescriptor> = [
  {
    value: 1,
    level: 'urgent',
    label: 'Urgent',
    color: 'var(--color-priority-urgent)',
    tint: 'var(--color-priority-urgent-tint)',
    ink: 'var(--color-priority-urgent-ink)',
  },
  {
    value: 3,
    level: 'important',
    label: 'Important',
    color: 'var(--color-priority-important)',
    tint: 'var(--color-priority-important-tint)',
    ink: 'var(--color-priority-important-ink)',
  },
  {
    value: 5,
    level: 'medium',
    label: 'Medium',
    color: 'var(--color-priority-medium)',
    tint: 'var(--color-priority-medium-tint)',
    ink: 'var(--color-priority-medium-ink)',
  },
  {
    value: 9,
    level: 'low',
    label: 'Low',
    color: 'var(--color-priority-low)',
    tint: 'var(--color-priority-low-tint)',
    ink: 'var(--color-priority-low-ink)',
  },
];

export const PRIORITY_BY_VALUE: Record<PriorityNumber, PriorityDescriptor> = Object.freeze({
  // biome-ignore lint/style/noNonNullAssertion: PRIORITY_LEVELS is a fixed 4-tuple defined above.
  1: PRIORITY_LEVELS.find((p) => p.value === 1)!,
  // biome-ignore lint/style/noNonNullAssertion: see above
  3: PRIORITY_LEVELS.find((p) => p.value === 3)!,
  // biome-ignore lint/style/noNonNullAssertion: see above
  5: PRIORITY_LEVELS.find((p) => p.value === 5)!,
  // biome-ignore lint/style/noNonNullAssertion: see above
  9: PRIORITY_LEVELS.find((p) => p.value === 9)!,
});

export const PRIORITY_BY_LEVEL: Record<PriorityLevel, PriorityDescriptor> = Object.freeze({
  urgent: PRIORITY_BY_VALUE[1],
  important: PRIORITY_BY_VALUE[3],
  medium: PRIORITY_BY_VALUE[5],
  low: PRIORITY_BY_VALUE[9],
});

/** The default priority used when a task has none specified. */
export const DEFAULT_PRIORITY: PriorityDescriptor = PRIORITY_BY_VALUE[5];

/** Resolve a descriptor by stored value, falling back to Medium when unknown. */
export function priorityFromNumber(n: number | null | undefined): PriorityDescriptor {
  if (n === 1 || n === 3 || n === 5 || n === 9) return PRIORITY_BY_VALUE[n];
  return DEFAULT_PRIORITY;
}
