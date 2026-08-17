// packages/planner/tests/fixtures/golden/loader.ts
//
// Loads typed YAML golden cases (spec §D/§F): reads cases/*.yaml, validates each
// document against GoldenCaseSchema, resolves `facts.*` refs against the frozen
// manifests/golden-facts.json, selects by suite (dropping holdout by default),
// and down-projects to the harness EvalCase so @seta/shared-agent-evals can run
// them. Fact resolution throws on a miss — a stale ref must fail loudly, never
// silently resolve to undefined.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { EvalCase } from '@seta/shared-agent-evals';
import { parse as parseYaml } from 'yaml';
import { type GoldenCase, GoldenCaseSchema } from './schema.ts';

const FACTS_URL = new URL('./manifests/golden-facts.json', import.meta.url);

/** The A1 (query) dataset — the default, so every existing call site is unchanged. */
export const QUERY_CASES_DIR = new URL('./cases/', import.meta.url);
/** The A2 (action) dataset. One harness, two datasets (design D5). */
export const ACTION_CASES_DIR = new URL('./action/cases/', import.meta.url);

type Suite = 'smoke' | 'regression' | 'nightly';

// --- Fact refs ---------------------------------------------------------------

let cachedFacts: unknown = null;

function facts(): unknown {
  if (cachedFacts === null) cachedFacts = JSON.parse(readFileSync(FACTS_URL, 'utf8'));
  return cachedFacts;
}

/**
 * Resolves a dotted `facts.…` reference against the committed manifest.
 * Throws if any segment is missing so a stale ref surfaces immediately.
 */
export function resolveFactRef(ref: string): unknown {
  let node: unknown = facts();
  const segments = ref.split('.');
  for (const seg of segments) {
    if (typeof node !== 'object' || node === null || !(seg in (node as Record<string, unknown>))) {
      throw new Error(`resolveFactRef: unknown fact ref "${ref}" (failed at segment "${seg}")`);
    }
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

// --- Case loading ------------------------------------------------------------

export interface LoadOptions {
  suite?: Suite;
  includeHoldout?: boolean;
  includeAll?: boolean;
  /** Which dataset to read. Defaults to `QUERY_CASES_DIR`. */
  casesDir?: URL;
}

/**
 * Reads and validates every case file, then filters. `includeAll` returns all
 * validated cases unfiltered; otherwise cases are kept when they belong to
 * `suite` (if given) and are not holdout (unless `includeHoldout`).
 */
export function loadGoldenCases(opts: LoadOptions = {}): GoldenCase[] {
  const all = readAllCases(opts.casesDir ?? QUERY_CASES_DIR);
  if (opts.includeAll) return all;
  return all.filter((c) => {
    if (opts.suite && !c.suites.includes(opts.suite)) return false;
    if (c.holdout && !opts.includeHoldout) return false;
    return true;
  });
}

function readAllCases(dir: URL): GoldenCase[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();
  const cases: GoldenCase[] = [];
  for (const file of files) {
    const raw = readFileSync(new URL(file, dir), 'utf8');
    const parsed = parseYaml(raw);
    const docs = Array.isArray(parsed) ? parsed : [parsed];
    for (const doc of docs) {
      if (doc == null) continue;
      cases.push(GoldenCaseSchema.parse(doc));
    }
  }
  return cases;
}

// --- Down-projection to the harness EvalCase ---------------------------------

/**
 * Down-projects a validated golden case to the harness EvalCase. Agent and
 * conversation cases run on the deterministic lane; their expected `facts` refs
 * are resolved to a `{ ref: value }` groundTruth map. Retrieval cases carry the
 * graded relevance map as groundTruth (scored by the IR module, not exact-match).
 */
export function toEvalCase(c: GoldenCase): EvalCase {
  if (c.kind === 'retrieval') {
    return {
      name: c.id,
      layer: 'deterministic',
      input: { query: c.query },
      actor: { tenantId: c.tenantId, userId: '' },
      groundTruth: { relevance: c.relevance, k: c.evaluation.k },
    };
  }

  const input = c.kind === 'agent' ? c.input : { turns: c.turns };
  const refs =
    c.kind === 'agent'
      ? c.expected.facts.map((f) => f.ref)
      : c.turns.flatMap((t) => t.expected.facts.map((f) => f.ref));
  const groundTruth: Record<string, unknown> = {};
  for (const ref of refs) groundTruth[ref] = resolveFactRef(ref);

  return {
    name: c.id,
    layer: 'deterministic',
    input,
    actor: c.actor,
    groundTruth,
  };
}
