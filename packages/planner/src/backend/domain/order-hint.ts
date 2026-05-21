import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

export const hintBetween = (prev: string | null, next: string | null): string =>
  generateKeyBetween(prev, next);

export const hintsForN = (n: number): string[] => generateNKeysBetween(null, null, n);
