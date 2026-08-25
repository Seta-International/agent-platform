import type {
  MoraleRecipientTag,
  MoraleSelectableTag,
  MoraleSenderCapacity,
} from '../api/people-client.ts';

export const TAG_LABELS: Record<MoraleRecipientTag, string> = {
  hr: 'HR',
  tl: 'Team Leader',
  am: 'Account Manager',
  pmo: 'PMO',
  bod: 'Board of Directors',
};

/**
 * Furthest-first, after the always-on HR row: the roles outside the sender's reporting
 * line come before the ones inside it, so raising a concern about your own lead does not
 * start by asking you to tick your lead's name.
 *
 * Display order only. Which tag a person is *filed* under when they hold several is a
 * separate, closest-first rule (`TAG_PRIORITY` in `resolve-morale-recipients.ts`).
 */
export const TAG_ORDER: MoraleSelectableTag[] = ['pmo', 'bod', 'am', 'tl'];

/**
 * Shown on the picker when a role is ticked but nobody is chosen. Ticking a role states
 * an intent to send to someone in it, so the empty picker is an unfinished step rather
 * than a mistake — the wording asks for the missing pick instead of scolding.
 */
export const TAG_EMPTY_ERROR: Record<MoraleSelectableTag, string> = {
  tl: 'Please select a team leader to include them.',
  am: 'Please select an account manager to include them.',
  pmo: 'Please select a PMO to include them.',
  bod: 'Please select a board member to include them.',
};

export const RATING_LABELS: Record<number, string> = {
  1: 'Very unhappy',
  2: 'Unhappy',
  3: 'Neutral',
  4: 'Happy',
  5: 'Very happy',
};

/** Why HR is on every note — shown under the locked checkbox, beside its badge. */
export const HR_REASON =
  'Your concern reaches someone who can act on it independently of your reporting line.';

/** The badge that says HR cannot be unticked; the reason above says why. */
export const HR_BADGE = 'Always included';

export function initialsOf(name: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const first = parts.at(0);
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  // Vietnamese names run family-name-first, so the last word is the given name that
  // people actually go by — pair its initial with the family one.
  return (first.slice(0, 1) + (parts.at(-1) ?? '').slice(0, 1)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Recipient inbox & trend (FUT-786)
// ---------------------------------------------------------------------------

/** How a sender is described in their own note, from the capacity they wrote in. */
export const SENDER_CAPACITY_LABELS: Record<MoraleSenderCapacity, string> = {
  member: 'Member',
  tl: 'Team Leader',
};

/** The group notes fall into when their sender held no allocation. */
export const NO_PROJECT_LABEL = 'No project';

/** Stands in for the body of a submission that carried a rating but no words. */
export const RATING_ONLY_TEXT = 'Rating submitted without a note.';

/** How many characters of a note the list shows before it needs "+ more". */
export const NOTE_PREVIEW_CHARS = 180;

/**
 * Cuts a note to the preview length on a word boundary.
 *
 * Returns the whole text unchanged when it already fits, so a short note never grows a
 * "+ more" that reveals nothing.
 */
export function previewOf(text: string): { shown: string; isTruncated: boolean } {
  if (text.length <= NOTE_PREVIEW_CHARS) return { shown: text, isTruncated: false };
  const cut = text.lastIndexOf(' ', NOTE_PREVIEW_CHARS);
  return { shown: text.slice(0, cut > 0 ? cut : NOTE_PREVIEW_CHARS), isTruncated: true };
}

/** 'YYYY-MM-DD' for an instant as seen in Asia/Ho_Chi_Minh, matching the server's window. */
export function vnDay(at: Date): string {
  // en-CA is the locale that formats as YYYY-MM-DD, which is what the API expects.
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** 'YYYY-MM' for an instant in Asia/Ho_Chi_Minh — the period key the trend is stored under. */
export function vnMonth(at: Date): string {
  return vnDay(at).slice(0, 7);
}

/** `month` shifted by `delta` calendar months, staying in 'YYYY-MM'. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const zeroBased = year * 12 + (m - 1) + delta;
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, '0')}`;
}

/** Compact axis label, e.g. '2026-08' → '08/26'. */
export function monthAxisLabel(month: string): string {
  const [year, m] = month.split('-') as [string, string];
  return `${m}/${year.slice(2)}`;
}

/** Long form for tooltips and pickers, e.g. '2026-08' → 'August 2026'. */
export function monthLongLabel(month: string): string {
  const [year, m] = month.split('-') as [string, string];
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${year}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatNoteTimestamp(iso: string): string {
  const at = new Date(iso);
  const date = at.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function noteCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'note' : 'notes'}`;
}
