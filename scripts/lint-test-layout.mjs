#!/usr/bin/env node
// Asserts the workspace test-folder convention from PR-A:
//   * Zero __tests__/ or test/ directories under packages|apps|sdks.
//   * Each package has at most one tests/ directory at its own root.
//   * Inside tests/, only unit/, integration/, contract/, helpers/ allowed,
//     plus global-setup.ts, helpers.ts, setup.ts at the tests/ root.

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['packages', 'apps', 'sdks'];
const FORBIDDEN_DIR_NAMES = new Set(['__tests__', 'test']);
const ALLOWED_TESTS_SUBDIRS = new Set(['unit', 'integration', 'contract', 'helpers']);
const ALLOWED_TESTS_FILES = new Set(['global-setup.ts', 'helpers.ts', 'setup.ts']);
// Some apps keep an e2e harness at tests/e2e/. Permit it for apps/* only.
const APPS_ALLOWED_EXTRA = new Set(['e2e']);

const errors = [];

async function walk(dir, visit) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.turbo') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await visit(full, e.name);
      await walk(full, visit);
    }
  }
}

async function findPackageRoots(root) {
  const out = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules') continue;
    const pkgPath = join(root, e.name);
    try {
      await stat(join(pkgPath, 'package.json'));
      out.push(pkgPath);
    } catch {
      // not a package root; recurse one level for nested workspaces (none today)
    }
  }
  return out;
}

for (const r of SCAN_ROOTS) {
  // 1) zero forbidden dir names anywhere under the scan root
  await walk(join(ROOT, r), (full, name) => {
    if (FORBIDDEN_DIR_NAMES.has(name)) {
      errors.push(`forbidden directory: ${relative(ROOT, full)}`);
    }
  });
}

for (const r of SCAN_ROOTS) {
  const isApps = r === 'apps';
  const pkgs = await findPackageRoots(join(ROOT, r));
  for (const pkg of pkgs) {
    // 2) at most one tests/ directory, at the package root
    const nonRootTestsDirs = [];
    await walk(pkg, (full, name) => {
      if (name === 'tests' && full !== join(pkg, 'tests')) {
        nonRootTestsDirs.push(relative(ROOT, full));
      }
    });
    for (const d of nonRootTestsDirs) errors.push(`tests/ directory not at package root: ${d}`);

    // 3) inside <pkg>/tests/: only allowlisted children
    const testsDir = join(pkg, 'tests');
    let testsEntries;
    try {
      testsEntries = await readdir(testsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of testsEntries) {
      const rel = relative(ROOT, join(testsDir, e.name));
      if (e.isDirectory()) {
        if (ALLOWED_TESTS_SUBDIRS.has(e.name)) continue;
        if (isApps && APPS_ALLOWED_EXTRA.has(e.name)) continue;
        errors.push(`disallowed entry under tests/: ${rel}`);
      } else if (e.isFile()) {
        if (ALLOWED_TESTS_FILES.has(e.name)) continue;
        errors.push(`disallowed entry under tests/: ${rel}`);
      }
    }
  }
}

if (errors.length) {
  console.error(`lint:test-layout — ${errors.length} violation(s):`);
  for (const m of errors) console.error(`  ${m}`);
  process.exit(1);
}
console.log('lint:test-layout — OK');
