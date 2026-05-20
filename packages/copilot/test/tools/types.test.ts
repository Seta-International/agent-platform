import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CopilotTool } from '../../src/backend/tools/_types.ts';
import { toToolBag } from '../../src/backend/tools/_types.ts';
import { STATIC_SELF_TOOLS } from '../../src/backend/tools/self-tools.ts';

describe('toToolBag', () => {
  it('produces a Mastra-shaped tools record', () => {
    const tool: CopilotTool<z.ZodObject<{ x: z.ZodString }>> = {
      name: 'x.echo',
      description: 'echoes',
      inputSchema: z.object({ x: z.string() }),
      requiredPermission: 'copilot.chat.use',
      execute: async (_actor, input) => ({ echoed: input.x }),
    };
    const bag = toToolBag([tool]);
    const entry = bag['x.echo'];
    expect(entry).toBeDefined();
    expect(entry?.description).toBe('echoes');
  });

  it('preserves needsApproval flag when set', () => {
    const tool: CopilotTool<z.ZodObject<Record<string, never>>> = {
      name: 'y.write',
      description: 'writes',
      inputSchema: z.object({}),
      requiredPermission: 'copilot.chat.use',
      needsApproval: true,
      execute: async () => null,
    };
    const bag = toToolBag([tool]);
    const entry = bag['y.write'];
    expect(entry?.needsApproval).toBe(true);
  });
});

describe('STATIC_SELF_TOOLS', () => {
  it('contains the four static self tools', () => {
    const names = STATIC_SELF_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      'core.serverTime',
      'identity.listMyRoles',
      'identity.updateMyDisplayName',
      'identity.whoAmI',
    ]);
  });
});
