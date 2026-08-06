import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = ['packages', 'apps', 'sdks'];

/**
 * FUT-859 gate, built to the same shape as the FUT-800 temporal gate next door.
 *
 * `thread_id` is the RequestContext entry that is INVISIBLE when missing: the
 * entity recorder and the task-ref resolver both read it, and both silently
 * no-op without it, so "the first one" and task-by-name quietly stop resolving
 * and nothing logs an error. Eleven of the fifteen hand-rolled construction
 * sites had dropped it, which is why this bug kept coming back one call site at
 * a time. Prefer `buildAgentRequestContext(ctx)` — a file that uses it
 * constructs nothing and passes trivially.
 *
 * Files allowed to construct a RequestContext with no thread id, each with the
 * reason it needs none. Adding an entry is a review decision, not a default.
 */
const ALLOWLIST = new Map<string, string>([
  [
    'packages/agent/src/backend/routes/workflows.ts',
    'workflow rerun/start routes — a workflow run has no chat thread to carry',
  ],
]);

/** Construction sites this gate counts. */
const CONSTRUCTS = 'new RequestContext(';
/** Either form satisfies it: the factory sets the entry, or the file sets it itself. */
const SATISFIES = ['buildAgentRequestContext', 'RC_THREAD_ID'];

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
 * Only code counts, on both sides of the comparison.
 *
 *  - Comments are prose: `conversation-memory.ts` documents Mastra's internal
 *    `new RequestContext(Object.entries(...))` rebuild in a comment, and a
 *    detector that counted prose would report that file as an offender forever.
 *    Symmetrically, a comment merely *mentioning* RC_THREAD_ID must not satisfy
 *    the gate.
 *  - Import lines don't count either: removing a `rc.set(RC_THREAD_ID, …)`
 *    leaves its import behind, and a token-counting gate that accepted it would
 *    wave the regression straight through (the FUT-800 gate learned that one).
 *
 * `(^|[^:])` keeps `https://` out of the line-comment rule.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^import\s[\s\S]*?from\s+'[^']*';/gm, '');
}

/**
 * A file passes when it propagates the thread id at least once per RequestContext
 * it constructs. Counted per file rather than per construction because a context
 * is often built in a helper declared above its call site, exactly as the
 * temporal gate handles — and requiring one propagation per construction still
 * catches a two-context file where only one carries the thread.
 */
function threadIdShortfall(source: string): number {
  const body = codeOnly(source);
  const constructions = countOccurrences(body, CONSTRUCTS);
  if (constructions === 0) return 0;
  const propagations = SATISFIES.reduce((sum, token) => sum + countOccurrences(body, token), 0);
  return Math.max(0, constructions - propagations);
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
      const missing = threadIdShortfall(readFileSync(abs, 'utf8'));
      if (missing > 0) offenders.push({ file: relPath, missing });
    }
  }
  return offenders;
}

describe('FUT-859 request-context thread-id gate', () => {
  it('every RequestContext construction carries the chat thread id', () => {
    const offenders = findOffenders();
    const report = offenders.map((o) => `${o.file} (${o.missing} without thread id)`).join('\n  ');
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : 'These RequestContext constructions drop thread_id, so the entity recorder and ' +
            'task-ref resolver will silently no-op and task references stop resolving ' +
            '(FUT-859). Build it with buildAgentRequestContext(ctx), or set RC_THREAD_ID ' +
            `yourself, or add the file to ALLOWLIST in this test with a reason:\n  ${report}`,
    ).toEqual([]);
  });

  it('detects a construction that drops the thread id (guards the detector itself)', () => {
    const bare = "const rc = new RequestContext();\nrc.set('tenant_id', t);";
    expect(threadIdShortfall(bare)).toBe(1);
  });

  it('accepts a construction that sets the thread id', () => {
    const ok = 'const rc = new RequestContext();\nrc.set(RC_THREAD_ID, ctx.threadId);';
    expect(threadIdShortfall(ok)).toBe(0);
  });

  it('accepts a file that constructs nothing because it uses the factory', () => {
    expect(threadIdShortfall('const rc = buildAgentRequestContext(ctx);')).toBe(0);
  });

  it('still catches a second, thread-less context in an otherwise correct file', () => {
    const mixed =
      'const a = new RequestContext();\na.set(RC_THREAD_ID, id);\n' +
      "const b = new RequestContext();\nb.set('tenant_id', t);";
    expect(threadIdShortfall(mixed)).toBe(1);
  });

  it('does not let the import statement alone satisfy the gate', () => {
    const importOnly =
      "import { RC_THREAD_ID } from '@seta/agent-sdk';\nconst rc = new RequestContext();";
    expect(threadIdShortfall(importOnly)).toBe(1);
  });

  it('ignores a construction that only appears inside a comment', () => {
    // conversation-memory.ts explains Mastra's `new RequestContext(...)` rebuild
    // in prose; counting that made the file a permanent false offender.
    const prose =
      '// Mastra rebuilds it (`new RequestContext(Object.entries(...))`) per step.\n' +
      '/* also new RequestContext( in a block comment */\n' +
      'export function noop(): void {}';
    expect(threadIdShortfall(prose)).toBe(0);
  });

  it('does not let a comment mentioning the thread id satisfy the gate', () => {
    const commented = 'const rc = new RequestContext();\n// TODO set RC_THREAD_ID here';
    expect(threadIdShortfall(commented)).toBe(1);
  });

  it('does not mistake a URL for a line comment', () => {
    const withUrl =
      '// see https://example.test/docs\nconst rc = new RequestContext();\nrc.set(RC_THREAD_ID, id);';
    expect(threadIdShortfall(withUrl)).toBe(0);
  });

  it('keeps every allowlist entry justified and real', () => {
    for (const [file, reason] of ALLOWLIST) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(10);
      expect(() => statSync(join(REPO_ROOT, file)), `${file} no longer exists`).not.toThrow();
    }
  });
});
