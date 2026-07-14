import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Not wired into `turbo run test` / `test:affected`: turbo/generators has no
// package.json and isn't covered by any pnpm workspace glob, so this file
// runs only when invoked directly, e.g.
// `pnpm exec vitest run turbo/generators/config.test.ts`. Wiring it into CI
// is deferred to Phase 2.
const configSrc = readFileSync(fileURLToPath(new URL('./config.ts', import.meta.url)), 'utf8');

describe('module generator eval scaffolding', () => {
  it('adds the eval-manifest template action', () => {
    expect(configSrc).toContain('src/backend/eval-manifest.ts');
  });
  it('adds the example eval test template action', () => {
    expect(configSrc).toContain('tests/unit/evals/example.eval.test.ts');
  });
});
