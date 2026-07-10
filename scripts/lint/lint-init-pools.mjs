// scripts/lint/lint-init-pools.mjs
//
// `initPools({ databaseUrl })` with no `appDatabaseUrl` silently gives the "web" pool the
// admin connection string. Every RLS policy then evaluates as a BYPASSRLS superuser, and
// nothing fails: `scoped()` still pins a connection, still sets the tenant GUC, still
// returns rows. The backstop is simply inert.
//
// apps/worker shipped in exactly that state (DB-1 PR1). Without catching it, moving the
// modules onto the executor would have been a no-op there, with every test green.
//
// So: the long-running composition roots must pass the key. The *value* may be undefined —
// `DATABASE_APP_URL` is optional, and initPools falls back with a runtime warning so the
// self-host onboarding contract in CLAUDE.md keeps working. This lint checks the call site
// made the choice, not that a particular environment set the variable.
//
// apps/cli is excluded on purpose: it runs everything inside `maintenance()`, so it never
// resolves the app pool and has no app-role work to do.
import { readFileSync } from 'node:fs';

const ROOTS = ['apps/server/src/index.ts', 'apps/worker/src/index.ts'];

// initPools( ... ) up to the matching close paren of a single-depth object argument.
const CALL_RE = /initPools\s*\(\s*\{([\s\S]*?)\}\s*\)/g;

let failed = false;

for (const file of ROOTS) {
  const src = readFileSync(file, 'utf8');
  const calls = [...src.matchAll(CALL_RE)];

  if (calls.length === 0) {
    console.error(
      `${file}: no initPools({ ... }) call found. This file is a composition root; if it ` +
        `stopped initialising the pools, update ROOTS in scripts/lint/lint-init-pools.mjs.`,
    );
    failed = true;
    continue;
  }

  for (const [, body] of calls) {
    if (!/\bappDatabaseUrl\s*:/.test(body)) {
      console.error(
        `${file}: initPools() does not pass \`appDatabaseUrl\`. The "web" pool would fall back ` +
          `to the admin connection and every RLS policy would evaluate as a BYPASSRLS ` +
          `superuser — silently, with all tests green. Pass \`appDatabaseUrl: env.DATABASE_APP_URL\`.`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`lint-init-pools: ${ROOTS.length} composition roots pass appDatabaseUrl`);
