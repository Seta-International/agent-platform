import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('vendor dedup', () => {
  it('resolves exactly one React 19 version across the workspace', () => {
    const out = execSync('pnpm why react -r --json', {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    // Top-level array entries are the physically-installed `react` instances;
    // nested `dependents[]` carry their own (non-react) version fields, so we
    // parse the JSON and inspect only entries whose name === 'react' rather
    // than regex-scanning every "version" string in the tree.
    const entries: Array<{ name: string; version: string }> = JSON.parse(out);
    const versions = new Set(
      entries
        .filter((e) => e.name === 'react' && e.version.startsWith('19.'))
        .map((e) => e.version),
    );
    expect(versions.size).toBe(1);
  });
});
