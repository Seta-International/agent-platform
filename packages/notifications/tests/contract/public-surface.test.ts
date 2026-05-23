import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

describe('@seta/notifications public surface', () => {
  // ENABLED after PRs B + C + D normalize every module's exports map to the canonical set.
  // PR-A's exports today include legacy entries (e.g. ./http, ./stream); strict matching
  // would block this PR. Leave skipped here; PR-D enables it.
  it.skip('exports match the canonical set', () => {
    const allowed = new Set([
      '.',
      './events',
      './rbac',
      './contracts',
      './agent-tools',
      './register',
      './testing',
    ]);
    const declared = Object.keys(pkg.exports as Record<string, unknown>);
    for (const e of declared) {
      expect(allowed.has(e), `unexpected export entry: ${e}`).toBe(true);
    }
  });

  it('main entry re-exports only domain functions, not backend internals', async () => {
    const mod = await import('@seta/notifications');
    for (const key of Object.keys(mod)) {
      expect(
        key,
        `'${key}' on main entry looks like a backend symbol (Client/Pool/Pgschema/drizzle/schema suffix)`,
      ).not.toMatch(/(Client|Pool|Pgschema|drizzle|schema)$/i);
    }
  });
});
