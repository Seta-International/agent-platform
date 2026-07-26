// scripts/dev/golden-facts.ts
//
// generate → diff → promote flow for the golden dataset's independent SQL fact
// oracle (spec §C). The committed manifest at
// packages/planner/tests/fixtures/golden/manifests/golden-facts.json is the
// frozen ground truth the eval and preflight assert against; it is NEVER
// written by CI — only a human runs `promote` after reviewing a `diff`.
//
// Subcommands:
//   generate  connect to the seeded dev DB, print candidate facts JSON to stdout
//   diff      deep-diff the candidate against the committed manifest; exit 1 on drift
//   promote   overwrite the committed manifest with the freshly generated candidate
//
// The oracle is RELATIONAL only (no embeddings), so this does not require
// `seed:golden:embed` — a plain `pnpm seed:golden` is enough.
//
// Usage:
//   pnpm golden:facts:generate > /tmp/golden-facts.candidate.json   # review by hand
//   pnpm golden:facts:diff                                          # exit 1 on drift
//   pnpm golden:facts:promote                                       # writes the manifest

import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { diffGoldenFacts } from '../../packages/planner/tests/fixtures/golden/oracles/facts-diff.ts';
import {
  type GoldenFacts,
  generateGoldenFacts,
} from '../../packages/planner/tests/fixtures/golden/oracles/generate-facts.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://seta:seta@localhost:5542/seta';

const MANIFEST_URL = new URL(
  '../../packages/planner/tests/fixtures/golden/manifests/golden-facts.json',
  import.meta.url,
);

async function generate(): Promise<GoldenFacts> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    return await generateGoldenFacts(pool);
  } finally {
    await pool.end();
  }
}

async function readManifest(): Promise<GoldenFacts> {
  return JSON.parse(await readFile(MANIFEST_URL, 'utf8')) as GoldenFacts;
}

function serialize(facts: GoldenFacts): string {
  return `${JSON.stringify(facts, null, 2)}\n`;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'generate': {
      process.stdout.write(serialize(await generate()));
      return;
    }
    case 'diff': {
      const [candidate, committed] = await Promise.all([generate(), readManifest()]);
      const drift = diffGoldenFacts(committed, candidate);
      if (drift.length === 0) {
        console.log('golden-facts: no drift — candidate matches the committed manifest.');
        return;
      }
      console.error(`golden-facts: ${drift.length} drift line(s) vs committed manifest:\n`);
      for (const line of drift) console.error(`  ${line}`);
      console.error('\nRun `pnpm golden:facts:promote` after reviewing to accept these changes.');
      process.exit(1);
      return;
    }
    case 'promote': {
      const candidate = await generate();
      writeFileSync(MANIFEST_URL, serialize(candidate));
      console.log(`golden-facts: promoted candidate to ${MANIFEST_URL.pathname}`);
      return;
    }
    default:
      console.error('usage: golden-facts.ts <generate|diff|promote>');
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
