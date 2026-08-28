import type { MoraleRecipientTag, MoraleSelectableTag } from '../api/people-client.ts';

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
