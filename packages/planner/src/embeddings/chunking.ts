import { countTokens } from '@seta/shared-embeddings';

export const MAX_SOURCE_TOKENS = 1000;

export function fitsInWindow(source: string): boolean {
  return countTokens(source) <= MAX_SOURCE_TOKENS;
}
