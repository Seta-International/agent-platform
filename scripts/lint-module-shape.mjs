#!/usr/bin/env node
// Enforces the canonical module shape from
// docs/superpowers/specs/2026-05-23-architectural-tightening-design.md §4.
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

const MODULES_CHECKED = ['identity', 'planner', 'copilot', 'notifications', 'staffing'];

// TODO: promote to MODULES_CHECKED as each module is normalized.
//  - core: foundation tier; carries `composition/`, `middleware/`, `outbox/`,
//    `rpc/`, `runtime/`, `session/`, `test-support.ts`, `db/` at src/ root.
//    Pending its own canonicalization PR.
//  - integrations: feature tier; carries `db/` and `m365/` at src/ root.
//    Pending its own canonicalization PR.
//  - knowledge: carries `backend/embed/` (should be `embeddings/`) and
//    `backend/agent-tools.ts` (file at backend root). Pending normalization.
const MODULES_DEFERRED = ['core', 'integrations', 'knowledge'];

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
  'testing',
  'testing.ts',
  'backend',
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
]);

const errors = [];

function checkModule(modName) {
  const srcDir = join(ROOT, 'packages', modName, 'src');
  if (!existsSync(srcDir)) {
    errors.push(`[${modName}] src/ directory missing`);
    return;
  }
  for (const entry of readdirSync(srcDir)) {
    if (!SRC_ALLOWLIST.has(entry)) {
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
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `lint:module-shape — ok (${MODULES_CHECKED.length} checked, ${MODULES_DEFERRED.length} deferred)`,
);
