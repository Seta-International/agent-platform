import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderModuleRbac, renderPermissionKeys } from '../../src/codegen.ts';
import { INVENTORY } from '../../src/inventory.ts';
import { canonicalKeys } from '../../src/manifest.ts';

// Resolve repo root from this file's location (tests/unit/ → src/ → package/ → packages/ → root)
const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..');

describe('permission-keys codegen', () => {
  it('committed file matches a fresh generation', () => {
    const path = 'packages/shared-rbac/src/generated/permission-keys.ts';
    const before = readFileSync(resolve(repoRoot, path), 'utf8');
    execSync('pnpm gen:rbac', { cwd: repoRoot });
    expect(readFileSync(resolve(repoRoot, path), 'utf8')).toBe(before);
    // Spawns `pnpm gen:rbac` (pnpm → tsx → script); the default 5s timeout is too tight under
    // parallel full-suite load where this subprocess routinely takes >5s.
  }, 60_000);

  it('renderPermissionKeys reproduces the committed file', () => {
    const path = resolve(repoRoot, 'packages/shared-rbac/src/generated/permission-keys.ts');
    const keys = INVENTORY.flatMap((m) => canonicalKeys(m.statement)).sort();
    expect(readFileSync(path, 'utf8')).toBe(renderPermissionKeys(keys));
  });
});

describe('module rbac codegen drift', () => {
  for (const spec of INVENTORY) {
    it(`packages/${spec.module}/src/generated/rbac.ts matches inventory`, () => {
      const file = resolve(import.meta.dirname, `../../../${spec.module}/src/generated/rbac.ts`);
      expect(readFileSync(file, 'utf8')).toBe(renderModuleRbac(spec));
    });
  }
});
