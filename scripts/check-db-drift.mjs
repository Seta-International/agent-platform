#!/usr/bin/env node
// Regenerates each enrolled module's drizzle output and fails if drizzle-kit emits anything.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const modules = JSON.parse(readFileSync('scripts/db-drift-modules.json', 'utf8'));
if (modules.length === 0) {
  console.log('db-drift: no modules enrolled yet');
  process.exit(0);
}

function porcelain(path) {
  return execSync(`git status --porcelain -- ${path}`, { encoding: 'utf8' }).trim();
}

let failed = false;
for (const mod of modules) {
  const dir = `packages/${mod}/drizzle`;
  if (porcelain(dir) !== '') {
    console.error(`db-drift: ${dir} is dirty — commit or clean it before running`);
    process.exit(1);
  }
  try {
    execSync(`pnpm --filter @seta/${mod} db:generate`, { stdio: 'inherit' });
  } catch {
    // db:generate can write partial files before erroring — always restore so the tree stays clean.
    execSync(`git checkout -- ${dir} && git clean -fd -- ${dir}`);
    console.error(`db-drift: ${mod} db:generate failed — restored ${dir}`);
    failed = true;
    continue;
  }
  const diff = porcelain(dir);
  if (diff !== '') {
    console.error(`db-drift: ${mod} schema.ts diverges from committed migrations:\n${diff}`);
    execSync(`git checkout -- ${dir} && git clean -fd -- ${dir}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
