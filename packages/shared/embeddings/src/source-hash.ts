import { createHash } from 'node:crypto';

/**
 * Stable sha256 hex digest of a source string. Used as a content-hash gate so
 * worker handlers skip re-embedding when the source hasn't changed.
 *
 * Encoding is utf-8 (Node's default for createHash().update(string)).
 */
export function sourceHash(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
