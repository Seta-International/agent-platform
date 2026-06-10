import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve repo root from this file's location (tests/unit/ → src/ → package/ → packages/ → root)
const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..');

describe('permission-keys codegen', () => {
  it('committed file matches a fresh generation', () => {
    const path = 'packages/shared-rbac/src/generated/permission-keys.ts';
    const before = readFileSync(resolve(repoRoot, path), 'utf8');
    execSync('pnpm gen:rbac', { cwd: repoRoot });
    expect(readFileSync(resolve(repoRoot, path), 'utf8')).toBe(before);
  });
});
