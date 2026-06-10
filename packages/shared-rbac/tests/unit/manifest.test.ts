import { describe, expect, it } from 'vitest';
import { canonicalKeys, toManifest } from '../../src/manifest.ts';

const statement = { 'knowledge.file': ['read', 'write'], 'knowledge.search': ['read'] } as const;

describe('toManifest', () => {
  it('flattens resource:action into canonical dotted strings', () => {
    expect(canonicalKeys(statement).sort()).toEqual([
      'knowledge.file.read',
      'knowledge.file.write',
      'knowledge.search.read',
    ]);
  });

  it('builds a manifest with permission + role canonical strings', () => {
    const m = toManifest(
      'knowledge',
      statement,
      { 'knowledge.viewer': { 'knowledge.file': ['read'], 'knowledge.search': ['read'] } },
      { 'knowledge.viewer': 'Read-only' },
      { 'knowledge.file.read': 'Read a file' },
    );
    expect(m.module).toBe('knowledge');
    expect(m.roles[0]).toEqual({
      slug: 'knowledge.viewer',
      description: 'Read-only',
      permissions: ['knowledge.file.read', 'knowledge.search.read'],
    });
    expect(m.permissions.find((p) => p.key === 'knowledge.file.read')?.description).toBe(
      'Read a file',
    );
  });
});
