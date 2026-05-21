import { get_encoding } from 'tiktoken';

/**
 * Returns the cl100k_base token count for a source string. This matches what
 * OpenAI's text-embedding-3-{small,large} models consume — used to decide
 * single-vector vs. chunked-vector for an entity (spec §3.2 — chunk above 1000 tokens).
 *
 * The encoder is initialized lazily and cached for the life of the process.
 */
let encoder: ReturnType<typeof get_encoding> | undefined;

function getEncoder() {
  if (!encoder) encoder = get_encoding('cl100k_base');
  return encoder;
}

export function countTokens(source: string): number {
  if (source.length === 0) return 0;
  return getEncoder().encode(source).length;
}
