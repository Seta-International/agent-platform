#!/usr/bin/env node
// Fails when two migration files in the same drizzle directory share a numeric
// prefix, except known pre-squash collisions in KNOWN (ratchet: a stale KNOWN
// entry that no longer collides also fails).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// pre-squash collisions, removed by the module's squash PR (ratchet: stale entries fail)
const KNOWN = new Set(['packages/agent/drizzle:0001']);

function* sqlDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === 'node_modules' || name === 'dist' || name === 'meta') continue;
    if (readdirSync(p).some((f) => f.endsWith('.sql'))) yield p;
    yield* sqlDirs(p);
  }
}

let failed = false;
const seenKnown = new Set();
for (const dir of sqlDirs('packages')) {
  if (!dir.includes('/drizzle')) continue;
  const byPrefix = new Map();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const prefix = /^(\d+)_/.exec(f)?.[1];
    if (!prefix) continue;
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), f]);
  }
  for (const [prefix, files] of byPrefix) {
    if (files.length < 2) continue;
    const key = `${dir}:${prefix}`;
    if (KNOWN.has(key)) {
      seenKnown.add(key);
      continue;
    }
    console.error(`duplicate migration prefix ${prefix} in ${dir}: ${files.join(', ')}`);
    failed = true;
  }
}
for (const key of KNOWN) {
  if (!seenKnown.has(key)) {
    console.error(`stale known-collision entry (squashed?) — remove from KNOWN: ${key}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
