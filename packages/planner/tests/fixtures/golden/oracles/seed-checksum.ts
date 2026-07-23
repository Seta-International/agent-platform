// packages/planner/tests/fixtures/golden/oracles/seed-checksum.ts
//
// Deterministic checksum over the FROZEN seed inputs (spec §G/§H). The seed is
// defined entirely by these fixture source files, so their combined sha256 is a
// stable identity for "which dataset is this". `dataset.json.seedChecksum` is
// this value; preflight recomputes it and refuses to run on a mismatch, so a
// silent seed edit that forgot to re-promote the manifests is caught early.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Fixed order — changing the list or order changes the checksum by design.
const SEED_SOURCE_FILES = [
  'constants.ts',
  'organization.ts',
  'people.ts',
  'plans.ts',
  'tasks.ts',
  'events.ts',
  'decoy.ts',
  'seed.ts',
] as const;

export function computeSeedChecksum(): string {
  const hash = createHash('sha256');
  for (const name of SEED_SOURCE_FILES) {
    const url = new URL(`../${name}`, import.meta.url);
    hash.update(readFileSync(url));
  }
  return hash.digest('hex');
}
