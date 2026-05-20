import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { filterToolsByRbac } from '../src/backend/rbac-filter.ts';
import type { CopilotTool } from '../src/backend/tools/_types.ts';

const tools: CopilotTool<z.ZodObject<Record<string, never>>>[] = [
  {
    name: 'a',
    description: '',
    inputSchema: z.object({}),
    requiredPermission: 'copilot.chat.use',
    execute: async () => null,
  },
  {
    name: 'b',
    description: '',
    inputSchema: z.object({}),
    requiredPermission: 'identity.user.write.self',
    execute: async () => null,
  },
];

describe('filterToolsByRbac', () => {
  it('keeps tools whose permission the session holds', () => {
    const out = filterToolsByRbac(tools, { effective_permissions: new Set(['copilot.chat.use']) });
    expect(out.map((t) => t.name)).toEqual(['a']);
  });

  it('keeps both when session holds both permissions', () => {
    const out = filterToolsByRbac(tools, {
      effective_permissions: new Set(['copilot.chat.use', 'identity.user.write.self']),
    });
    expect(out.map((t) => t.name).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when no permissions match', () => {
    const out = filterToolsByRbac(tools, { effective_permissions: new Set<string>() });
    expect(out).toEqual([]);
  });
});
