// scripts/lint-mastra-access.mjs
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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TABLE_RE =
  /mastra_threads|mastra_messages|mastra_ai_spans|mastra_workflow_snapshot|mastra_traces|mastra_resources/;

const CONTAINMENT_DIR = 'packages/agent/src/backend/mastra-store/';
const FILE_ALLOWLIST = new Set([
  'packages/agent/src/backend/runtime.ts',
  'packages/agent/src/backend/memory.ts',
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
    if (TABLE_RE.test(lines[i])) {
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
