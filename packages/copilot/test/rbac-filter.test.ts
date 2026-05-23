import { createTool } from '@mastra/core/tools';
import { registerToolPermission } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { filterToolsByRbac } from '../src/backend/rbac-filter.ts';

const a = registerToolPermission(
  createTool({
    id: 'a',
    description: '',
    inputSchema: z.object({}),
    execute: async () => ({}),
  }),
  'copilot.chat.use',
);

const b = registerToolPermission(
  createTool({
    id: 'b',
    description: '',
    inputSchema: z.object({}),
    execute: async () => ({}),
  }),
  'identity.user.write.self',
);

describe('filterToolsByRbac', () => {
  it('keeps tools whose permission the session holds', () => {
    const out = filterToolsByRbac([a, b], {
      effective_permissions: new Set(['copilot.chat.use']),
    });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('keeps both when session holds both permissions', () => {
    const out = filterToolsByRbac([a, b], {
      effective_permissions: new Set(['copilot.chat.use', 'identity.user.write.self']),
    });
    expect(out.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when no permissions match', () => {
    const out = filterToolsByRbac([a, b], { effective_permissions: new Set<string>() });
    expect(out).toEqual([]);
  });
});
