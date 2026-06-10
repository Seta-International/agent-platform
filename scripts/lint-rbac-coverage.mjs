#!/usr/bin/env node
// scripts/lint-rbac-coverage.mjs
//
// Walks each module's src/backend/domain/ for exported functions. Any function
// whose name starts with a mutation verb (i.e. NOT a read prefix and not in the
// allowlist) must appear in a file that gates on a permission — either
// requirePermission(...) (re-resolves grants for an actor) or can(session, ...)
// (checks the already-resolved, overlay-aware session permission set).
//
// Heuristic is intentionally simple: the check is per-file, not per-function —
// one gate call in the file covers every exported mutation declared in that same
// file. Reviewers catch the rare false-pass; the alternative (full AST flow
// analysis) is not worth the dependency cost.
//
// Allowlist comment escape hatches (added to a file, before any exports):
//   // rbac: user-self-scoped     → user mutates only their own row, gated by user_id
//   // rbac: system-only          → emitted from event subscribers / cron, no caller session
//   // rbac: public-endpoint      → pre-authentication path (SSO, password reset, discovery)
//   // rbac: delegates            → forwards to a sibling mutation that owns the rbac check

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MODULES = ['knowledge', 'notifications', 'integrations', 'staffing', 'planner', 'identity'];
const READ_PREFIXES = [
  'get',
  'list',
  'search',
  'find',
  'exists',
  'count',
  'load',
  'fetch',
  'has',
  'is',
  'resolve',
  'build',
  'create', // factory style: createXStore returns an object, not a state change
];
const SKIP_FILE_PREFIX = '_';
const ALLOWLIST_COMMENTS = [
  '// rbac: user-self-scoped',
  '// rbac: system-only',
  '// rbac: public-endpoint',
  '// rbac: delegates',
];

const violations = [];

for (const mod of MODULES) {
  const domainDir = `packages/${mod}/src/backend/domain`;
  let entries;
  try {
    entries = await readdir(domainDir, { recursive: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.ts')) continue;
    if (entry.split('/').some((seg) => seg.startsWith(SKIP_FILE_PREFIX))) continue;
    const full = join(domainDir, entry);
    const src = await readFile(full, 'utf8');

    if (ALLOWLIST_COMMENTS.some((c) => src.includes(c))) continue;

    const fileGatesPermission = /\brequirePermission\s*\(|\bcan\s*\(/.test(src);

    const re = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g;
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (
        READ_PREFIXES.some(
          (p) => name === p || name.startsWith(`${p}${name[p.length]?.toUpperCase() ?? ''}`),
        )
      ) {
        // word-boundary prefix: "get" matches getX, "list" matches listX, but not "geta..."
        continue;
      }
      if (!fileGatesPermission) {
        violations.push(
          `${full}: exported mutation '${name}' has no requirePermission()/can() gate in its file`,
        );
      }
    }
  }
}

const WRITE_RBAC = /['"][^'"]*\.(?:write|delete)(?:\.|['"])/;
const TOOL_DIRS = [
  ...MODULES.map((m) => `packages/${m}/src/backend/agent-tools`),
  'packages/agent/src/backend/agent-tools',
];

for (const dir of TOOL_DIRS) {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.ts')) continue;
    if (entry === 'index.ts' || entry === 'register.ts' || entry.startsWith('register-')) continue;
    const full = join(dir, entry);
    const src = await readFile(full, 'utf8');
    if (!/defineAgentTool\s*\(/.test(src)) continue;
    const rbacMatch = src.match(/rbac:\s*(['"][^'"]+['"])/);
    if (!rbacMatch || !WRITE_RBAC.test(rbacMatch[1])) continue;
    if (!/needsApproval:\s*true/.test(src)) {
      violations.push(
        `${full}: write/delete tool (rbac ${rbacMatch[1]}) is missing needsApproval: true`,
      );
    }
  }
}

if (violations.length) {
  console.error('rbac-coverage violations:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('rbac-coverage: ok');
