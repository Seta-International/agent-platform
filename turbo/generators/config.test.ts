import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const configSrc = readFileSync(fileURLToPath(new URL('./config.ts', import.meta.url)), 'utf8');

describe('module generator eval scaffolding', () => {
  it('adds the eval-manifest template action', () => {
    expect(configSrc).toContain('src/backend/eval-manifest.ts');
  });
  it('adds the example eval test template action', () => {
    expect(configSrc).toContain('tests/unit/evals/example.eval.test.ts');
  });
});
