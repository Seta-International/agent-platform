import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('generate-facts.ts must not import agent tools (independent oracle, spec §C)', () => {
  const src = readFileSync(
    new URL('../../fixtures/golden/oracles/generate-facts.ts', import.meta.url),
    'utf8',
  );
  expect(src).not.toMatch(
    /agent-tools|resolve-member|query-tasks|find-similar-tasks|defineAgentTool/,
  );
});
