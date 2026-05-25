import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCopilotTool } from '../../src/define-copilot-tool';

describe('defineCopilotTool', () => {
  it('attaches needsApproval and displayName to the Mastra tool', () => {
    const tool = defineCopilotTool({
      id: 'x_doSomething',
      name: 'Do Something',
      description: 'Does X.',
      input: z.object({ q: z.string() }),
      output: z.object({ ok: z.boolean() }),
      rbac: 'x.write',
      needsApproval: true,
      execute: async () => ({ ok: true }),
    });
    expect((tool as unknown as { needsApproval?: boolean }).needsApproval).toBe(true);
    expect((tool as unknown as { displayName?: string }).displayName).toBe('Do Something');
  });

  it('passes suspendSchema + resumeSchema through to the Mastra tool', () => {
    const suspendSchema = z.object({ card: z.string() });
    const resumeSchema = z.object({ choice: z.enum(['a', 'b']) });
    const tool = defineCopilotTool({
      id: 'x_hitl',
      name: 'HITL Tool',
      description: 'Suspends with a typed card.',
      input: z.object({ q: z.string() }),
      output: z.object({ pick: z.string() }),
      suspendSchema,
      resumeSchema,
      execute: async (_input, ctx) => {
        if (!ctx.agent?.resumeData) {
          await ctx.agent?.suspend?.({ card: 'pick one' });
          return undefined;
        }
        return { pick: ctx.agent.resumeData.choice };
      },
    });
    // Mastra normalizes Zod via toStandardSchema; on the tool instance we
    // expect the schema fields to be present and non-null.
    const t = tool as unknown as {
      suspendSchema?: unknown;
      resumeSchema?: unknown;
    };
    expect(t.suspendSchema).toBeTruthy();
    expect(t.resumeSchema).toBeTruthy();
  });
});
