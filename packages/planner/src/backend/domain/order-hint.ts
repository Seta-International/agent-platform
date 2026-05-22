import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

export type PlanExternalSource = 'native' | 'm365';

// Planner directive orderHint form per
// https://learn.microsoft.com/graph/api/resources/planner-order-hint-format —
// `<prev> <next>!` with empty string substituted when either endpoint is missing.
// The Graph service rewrites this into a canonical short hint on Prefer: return=representation.
const m365Directive = (prev: string | null, next: string | null): string =>
  `${prev ?? ''} ${next ?? ''}!`;

export const hintBetween = (
  prev: string | null,
  next: string | null,
  planExternalSource: PlanExternalSource = 'native',
): string => {
  if (planExternalSource === 'm365') return m365Directive(prev, next);
  return generateKeyBetween(prev, next);
};

export const hintsForN = (
  n: number,
  planExternalSource: PlanExternalSource = 'native',
): string[] => {
  if (planExternalSource === 'm365') {
    const out: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < n; i++) {
      const h = m365Directive(cursor, null);
      out.push(h);
      cursor = h;
    }
    return out;
  }
  return generateNKeysBetween(null, null, n);
};
