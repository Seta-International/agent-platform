import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closePools, getLifecycleEntries, initPools } from '@seta/shared-db';
import { getPool } from '@seta/shared-db/composition';
import {
  collectViolations,
  diffBaseline,
  OWNED_SCHEMAS,
  parseBaseline,
  renderBaseline,
  type Violation,
} from '@seta/shared-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMigrationRegistry } from '../../src/commands/migrate.ts';

// The only place in the repo where all ten modules' migrations exist in one database
// (apps/cli/tests/global-setup.ts). `pnpm db:constitution` regenerates the baseline;
// a generated row has an empty `reason` and will not parse, so regeneration cannot
// launder a violation into a silent pass.
const UPDATE = process.env.DB_CONSTITUTION_UPDATE_BASELINE === '1';
const BASELINE_PATH = fileURLToPath(
  new URL('../../../../scripts/lint/db-constitution-baseline.json', import.meta.url),
);

let violations: Violation[];

beforeAll(async () => {
  initPools({
    databaseUrl: `${process.env.PLATFORM_TEST_PG_BASE}/${process.env.PLATFORM_TEST_PG_TEMPLATE}`,
  });
  const pool = getPool('worker');
  // vitest globalSetup runs in a separate module graph from the test-file worker, so this
  // process's lifecycle registry starts empty and buildMigrationRegistry() must repopulate
  // it. The length guard keeps us safe if that boundary is ever shared: registerLifecycle
  // throws on a duplicate table, so we must not build twice.
  if (getLifecycleEntries().length === 0) buildMigrationRegistry();
  violations = await collectViolations(pool, {
    schemas: OWNED_SCHEMAS,
    lifecycleTables: getLifecycleEntries().map((e) => e.table),
  });
});

afterAll(async () => {
  await closePools();
});

describe('db constitution gate', () => {
  it('holds the migrated catalog to its committed baseline', () => {
    if (UPDATE) {
      writeFileSync(BASELINE_PATH, renderBaseline(violations));
      console.log(
        `\ndb:constitution — wrote ${violations.length} rows to\n  ${BASELINE_PATH}\n` +
          'Every "reason" is empty and WILL NOT PARSE. Read each violation and fill in why it\n' +
          'is tolerated (accepted) or who owns it (debt + ticket) before committing.',
      );
      return;
    }

    const baseline = parseBaseline(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
    const { fresh, stale } = diffBaseline(violations, baseline);

    // Failure output is tab-separated so a fresh row can be pasted straight into the baseline;
    // a gate whose output cannot be pasted into the baseline is a gate people disable.
    const freshLines = fresh.map((v) => `${v.rule}\t${v.object}\t${v.detail}`);
    const staleLines = stale.map((r) => `${r.rule}\t${r.object}\t(no longer violates — remove)`);
    const message = [
      'Database constitution drift against the migrated catalog.',
      'FRESH = a live violation with no baseline row: add it with a reason (accepted) or ticket (debt).',
      'STALE = a baseline row that no longer occurs: delete it.',
      freshLines.length ? `\nFRESH:\n${freshLines.join('\n')}` : '',
      staleLines.length ? `\nSTALE:\n${staleLines.join('\n')}` : '',
    ].join('\n');

    expect(fresh, message).toEqual([]);
    expect(stale, message).toEqual([]);
  });

  // FUT-552: "The known worst offender is flagged by the new gate — a rule set that
  // does not flag it is not working." planner.task_comments (finding S8) breaks two rules.
  // Asserted against the live violations, not the baseline file: a test that reads the
  // baseline proves only that the row was typed. When DB-6 repairs task_comments, this
  // test and its baseline rows are deleted together.
  it('flags planner.task_comments', () => {
    const rulesFor = (object: string) =>
      violations.filter((v) => v.object === object).map((v) => v.rule);
    expect(rulesFor('planner.task_comments.updated_at')).toContain('timestamp-shape');
    expect(rulesFor('planner.task_comments')).toContain('version-column');
  });
});
