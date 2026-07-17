// Transcript-structure helpers, kept pure and dependency-free so they are the
// testable seam for date dividers and multi-bubble grouping — the assistant-ui
// wiring in agent-conversation.tsx is a thin selector over these.

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(day: Date, now: Date): string {
  if (isSameLocalDay(day, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(day, yesterday)) return 'Yesterday';
  // Pinned to en-US so the label is deterministic in tests and matches the
  // English transcript copy; the full year disambiguates old threads.
  return day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * The divider label to show above a message, or null when no divider is needed.
 * A divider appears on the first message and whenever the calendar day changes
 * from the previous message.
 */
export function dateDividerLabel(
  current: Date,
  previous: Date | undefined,
  now: Date,
): string | null {
  if (previous && isSameLocalDay(current, previous)) return null;
  return dayLabel(current, now);
}

export type BubbleGroup = 'first' | 'middle' | 'last';

/**
 * Corner-grouping position for a bubble at `index` within a run of `total`
 * adjacent bubbles. A lone bubble (total <= 1) is standalone (undefined).
 */
export function bubbleGroup(index: number, total: number): BubbleGroup | undefined {
  if (total <= 1) return undefined;
  if (index === 0) return 'first';
  if (index === total - 1) return 'last';
  return 'middle';
}
