#!/usr/bin/env node
// Enforces the canonical module shape from
//
// Walks every `packages/<m>/` in MODULES_CHECKED and asserts:
//   - every entry directly under `src/` is in SRC_ALLOWLIST (files and
//     directories; `events` and `contracts` accept either form).
//   - every *directory* directly under `src/backend/` is in
//     BACKEND_DIR_ALLOWLIST. Loose `.ts` files at `backend/` root are
//     permitted (spec §5.5 enumerates flat files like runtime.ts,
//     observability.ts, env.ts living at backend/ root).
//
// MODULES_DEFERRED are recognized but not yet checked; future PRs move them
// to MODULES_CHECKED once normalized.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const MODULES_CHECKED = [
  'identity',
  'planner',
  'agent',
  'notifications',
  'staffing',
  'core',
  'integrations',
  'knowledge',
];

const MODULES_DEFERRED = []; // all feature modules normalized.

const SRC_ALLOWLIST = new Set([
  'index.ts',
  'events.ts',
  'events',
  'rbac.ts',
  'contracts.ts',
  'contracts',
  'register.ts',
  'models.ts',
  'agent-tools.ts',
  'agent-reads.ts',
  'testing',
  'testing.ts',
  'backend',
]);

// core is foundation-tier and owns infrastructure surfaces consumed by EVERY app +
// every other module. Putting them under backend/ would imply "backend-only" semantics
// they don't have. Keep them at src/ root and extend the allowlist accordingly.
const CORE_EXTRA_SRC_ALLOWLIST = new Set([
  'composition',
  'middleware',
  'outbox',
  'rpc',
  'runtime',
  'session',
  'db',
  'test-support.ts',
]);

const BACKEND_DIR_ALLOWLIST = new Set([
  'domain',
  'subscribers',
  'jobs',
  'http',
  'stream',
  'workflows',
  'db',
  'embeddings',
  'retrieval',
  'parse',
  'sso',
  'agents',
  'agent-tools',
  'routes', // agent-owned HTTP route handlers split from routes.ts
  'orchestration', // staffing orchestrator-tier composition + agents + run state
  'm365', // integrations-owned external connector
  'scan', // knowledge-owned upload AV scanner
]);

const errors = [];

function checkModule(modName) {
  const srcDir = join(ROOT, 'packages', modName, 'src');
  if (!existsSync(srcDir)) {
    errors.push(`[${modName}] src/ directory missing`);
    return;
  }
  const effectiveSrcAllowlist =
    modName === 'core' ? new Set([...SRC_ALLOWLIST, ...CORE_EXTRA_SRC_ALLOWLIST]) : SRC_ALLOWLIST;
  for (const entry of readdirSync(srcDir)) {
    if (!effectiveSrcAllowlist.has(entry)) {
      errors.push(`[${modName}] src/${entry} not in canonical src/ allowlist`);
    }
  }
  const backendDir = join(srcDir, 'backend');
  if (!existsSync(backendDir)) return;
  for (const entry of readdirSync(backendDir)) {
    const fullPath = join(backendDir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (!BACKEND_DIR_ALLOWLIST.has(entry)) {
        errors.push(`[${modName}] src/backend/${entry}/ not in canonical backend/ allowlist`);
      }
    }
    // Loose .ts files at backend/ root are permitted (spec §5.5).
  }
}

for (const m of MODULES_CHECKED) checkModule(m);

if (errors.length > 0) {
  console.error('lint:module-shape — violations:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(
  `lint:module-shape — ok (${MODULES_CHECKED.length} checked, ${MODULES_DEFERRED.length} deferred)`,
);
