// scripts/lint/lint-mastra-access.mjs
//
// Mastra's shared engine tables (mastra_threads, mastra_messages, ...) are
// reachable only through packages/agent/src/backend/mastra-store/ — the
// tenant-containment module that owns resourceId ownership guards. This lint
// forbids any other source line under packages/ from mentioning a raw
// mastra_* table name, so spans/snapshots stay reachable only via
// workflow_runs lookups (see get-workflow-run-snapshot.ts) and thread/message
// access stays behind TenantGuardedMastraStore.
//
// Deliberately blunt: the regex matches comments too, not just code. Raw
// table names don't belong in feature source even as prose — say what the
// table is for in words, not its literal name.
//
// TABLE_RE covers every table Mastra creates in the `agent` schema (36, not
// a hand-listed six) via the `mastra_\w+` pattern, plus memory_messages (the
// PgVector semantic-recall index, which carries no mastra_ prefix — see
// backend/memory.ts). Own-identifier subtraction below keeps this generic
// pattern from false-positiving on columns we author ourselves.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Columns on our own agent.* tables that begin with `mastra_`. They are not
// Mastra tables — `workflow_approvals.mastra_run_id` is the agentic-resume
// handle for chat HITL. Strip them before matching so the blunt table regex
// stays blunt.
const OWN_IDENTIFIER_RE = /\bmastra_run_id\b/g;

// Every table Mastra creates in the `agent` schema, not a hand-listed six.
// `memory_messages` is the PgVector semantic-recall index (see backend/memory.ts)
// and carries no `mastra_` prefix, so it needs naming explicitly.
const TABLE_RE = /\b(mastra_\w+|memory_messages)\b/;

const CONTAINMENT_DIR = 'packages/agent/src/backend/mastra-store/';
const FILE_ALLOWLIST = new Set([
  'packages/agent/src/backend/runtime.ts',
  'packages/agent/src/backend/memory.ts',
  // The catalog gate names these tables in order to *exempt* them: Mastra owns their DDL, so
  // they cannot satisfy the constitution. Naming the exempt set is the one place a governance
  // rule must say the words out loud.
  'packages/shared-testing/src/db-constitution.ts',
]);

const SOURCE_RE = /\.(ts|tsx)$/;
const TEST_RE = /\.test\.ts$/;

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      yield* sourceFiles(p);
    } else if (SOURCE_RE.test(p) && !TEST_RE.test(p) && !p.includes('/tests/')) {
      yield p;
    }
  }
}

const violations = [];
for (const file of sourceFiles('packages')) {
  if (file.startsWith(CONTAINMENT_DIR) || FILE_ALLOWLIST.has(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_RE.test(lines[i].replace(OWN_IDENTIFIER_RE, ''))) {
      violations.push(`${file}:${i + 1}: ${lines[i].trim()}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    `lint-mastra-access: ${violations.length} raw mastra_* table reference(s) outside ${CONTAINMENT_DIR}:\n${violations.join('\n')}`,
  );
  process.exit(1);
}
process.exit(0);
