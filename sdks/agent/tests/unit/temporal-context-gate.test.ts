import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = ['packages', 'apps', 'sdks'];

/**
 * Files allowed to construct a Mastra Agent without a temporal block, each with
 * the reason it needs none. Adding an entry is a review decision, not a default.
 */
const ALLOWLIST = new Map<string, string>([
  [
    'packages/agent/src/backend/thread-title.ts',
    'generates conversation titles; no temporal semantics',
  ],
  [
    'packages/knowledge/src/backend/parse/cv-profile.ts',
    'parses an uploaded CV; no temporal semantics',
  ],
  ['apps/server/src/undici-timeouts.ts', "constructs undici's Agent, not Mastra's"],
]);

/** Either injection form satisfies the gate. */
const SATISFIES = ['withTemporalContext', 'temporalContextBlock'];

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'drizzle') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkTs(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      yield full;
    }
  }
}

function isTestFile(relPath: string): boolean {
  return (
    relPath.includes('/tests/') ||
    relPath.includes('/__tests__/') ||
    relPath.includes('.test.') ||
    relPath.includes('/fixtures/')
  );
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * A file passes when it injects the block at least once per Agent it constructs.
 * Counting per file rather than per `new Agent(` chunk is deliberate: three
 * agents render the block inside a `buildInstructions` builder declared ABOVE
 * their construction site, so a chunk-local scan would report them as offenders.
 * Requiring one injection per agent still catches a two-agent file where only
 * one is wrapped.
 */
function injectionShortfall(source: string): number {
  const agents = countOccurrences(source, 'new Agent(');
  if (agents === 0) return 0;
  // Import lines don't count: unwrapping a call site leaves its import behind,
  // and a token-counting gate that accepted it would wave the regression through.
  // Matched non-greedily across lines so multi-line named-import blocks — where
  // the token sits on its own line — are stripped whole.
  const body = source.replace(/^import\s[\s\S]*?from\s+'[^']*';/gm, '');
  const injections = SATISFIES.reduce((sum, token) => sum + countOccurrences(body, token), 0);
  return Math.max(0, agents - injections);
}

interface Offender {
  file: string;
  missing: number;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const root of SCAN_ROOTS) {
    for (const abs of walkTs(join(REPO_ROOT, root))) {
      const relPath = relative(REPO_ROOT, abs);
      if (isTestFile(relPath) || ALLOWLIST.has(relPath)) continue;
      const missing = injectionShortfall(readFileSync(abs, 'utf8'));
      if (missing > 0) offenders.push({ file: relPath, missing });
    }
  }
  return offenders;
}

describe('FUT-800 temporal-context gate', () => {
  it('every Agent construction injects the current date', () => {
    const offenders = findOffenders();
    const report = offenders.map((o) => `${o.file} (${o.missing} unwrapped)`).join('\n  ');
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : "These Agent constructions have no temporal context, so the model will guess today's " +
            'date (FUT-800). Wrap instructions with withTemporalContext(), or add the file to ' +
            `ALLOWLIST in this test with a reason:\n  ${report}`,
    ).toEqual([]);
  });

  it('detects an unwrapped agent (guards the detector itself)', () => {
    const unwrapped = "const a = new Agent({ id: 'x', instructions: BARE, model: m });";
    expect(injectionShortfall(unwrapped)).toBe(1);
  });

  it('accepts a wrapped agent', () => {
    const wrapped =
      "const a = new Agent({ id: 'x', instructions: withTemporalContext(BARE), model: m });";
    expect(injectionShortfall(wrapped)).toBe(0);
  });

  it('still catches a second, unwrapped agent in a wrapped file', () => {
    const mixed =
      'const a = new Agent({ instructions: withTemporalContext(A) });\n' +
      'const b = new Agent({ instructions: B });';
    expect(injectionShortfall(mixed)).toBe(1);
  });

  it('does not let the import statement alone satisfy the gate', () => {
    // Regression: unwrapping a call site leaves its import in place, so counting
    // raw token occurrences reported the file as compliant.
    const importOnly =
      "import { withTemporalContext } from '@seta/agent-sdk';\n" +
      'const a = new Agent({ instructions: BARE });';
    expect(injectionShortfall(importOnly)).toBe(1);
  });

  it('keeps every allowlist entry justified and real', () => {
    for (const [file, reason] of ALLOWLIST) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(10);
      expect(() => statSync(join(REPO_ROOT, file)), `${file} no longer exists`).not.toThrow();
    }
  });
});
