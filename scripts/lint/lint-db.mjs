// scripts/lint/lint-db.mjs
//
// One rule survives here: the enum style (constitution C4).
//
// R1 (tenant_id present), R3 (unique-constraint shape) and R4 (created_at present) moved to the
// catalog gate — `apps/cli/tests/integration/db-constitution.test.ts` — which queries pg_catalog
// after the migrations run. It sees `knowledge.chunks`, a LIST-partitioned table that exists only
// in hand-written SQL and was invisible to the regex below. A lint that guesses at what a
// migration produced is strictly worse than asking the database.
//
// C4 cannot move. After migration, `text({ enum })` and `textEnum()` are indistinguishable: one
// emits a CHECK and the other does not, but a text column with no CHECK cannot be told apart from
// a legitimately free-text column. It is a source rule, so it stays in a source lint.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function* schemaFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      yield* schemaFiles(p);
    } else if (/(^|\/)db\/schema(\.[\w-]+)?\.ts$/.test(p) || /\/db\/schema\/[\w-]+\.ts$/.test(p)) {
      yield p;
    }
  }
}

const violations = [];
for (const file of schemaFiles('packages')) {
  const src = readFileSync(file, 'utf8');
  if (!file.startsWith('packages/shared-db/') && /text\(\s*'[\w]+'\s*,\s*\{\s*enum\s*:/.test(src)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error(
    `lint-db: ${violations.length} file(s) declare an inline text enum. Use textEnum(column, values) ` +
      `from @seta/shared-db — it emits the Drizzle type and the CHECK constraint from one definition:\n` +
      violations.join('\n'),
  );
  process.exit(1);
}
console.log('lint-db: no inline text enums');
