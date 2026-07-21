// packages/planner/tests/fixtures/golden/oracles/facts-diff.ts
//
// Pure deep-diff for GoldenFacts (spec §C — the `diff` step of
// generate→diff→promote). Produces human-readable, dotted-path drift lines so
// `golden:facts:diff` can print exactly what changed and exit non-zero. Kept
// side-effect free (no I/O) so it is unit-testable without a DB.
import type { GoldenFacts } from './generate-facts.ts';

type Json = unknown;

function isPlainObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fmt(v: Json): string {
  return JSON.stringify(v);
}

function walk(path: string, committed: Json, candidate: Json, out: string[]): void {
  if (isPlainObject(committed) && isPlainObject(candidate)) {
    const keys = new Set([...Object.keys(committed), ...Object.keys(candidate)]);
    for (const k of [...keys].sort()) {
      const next = path ? `${path}.${k}` : k;
      if (!(k in committed)) {
        out.push(`+ ${next}: (added) ${fmt(candidate[k])}`);
      } else if (!(k in candidate)) {
        out.push(`- ${next}: (removed) ${fmt(committed[k])}`);
      } else {
        walk(next, committed[k], candidate[k], out);
      }
    }
    return;
  }
  if (fmt(committed) !== fmt(candidate)) {
    out.push(`~ ${path}: ${fmt(committed)} -> ${fmt(candidate)}`);
  }
}

/**
 * Deep-diffs a committed manifest against a freshly generated candidate.
 * Returns one drift line per difference (empty array when identical). Object
 * keys are compared as sets (added/removed reported); scalars and arrays are
 * compared by structural equality.
 */
export function diffGoldenFacts(committed: GoldenFacts, candidate: GoldenFacts): string[] {
  const out: string[] = [];
  walk('', committed, candidate, out);
  return out;
}
