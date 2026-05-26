import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCopilotTool } from '../../src/define-copilot-tool';

describe('defineCopilotTool', () => {
  it('passes needsApproval=true through to Mastra-native Tool.requireApproval, and sets displayName', () => {
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
    // requireApproval is the field Mastra's tool-builder reads (see
    // mastra/packages/core/src/tools/tool.ts:130 and builder.ts:802-808).
    expect((tool as unknown as { requireApproval?: unknown }).requireApproval).toBe(true);
    expect((tool as unknown as { displayName?: string }).displayName).toBe('Do Something');
  });

  it('defaults requireApproval to false when needsApproval is omitted', () => {
    const tool = defineCopilotTool({
      id: 'x_readSomething',
      name: 'Read Something',
      description: 'Reads X.',
      input: z.object({ q: z.string() }),
      output: z.object({ value: z.string() }),
      execute: async () => ({ value: 'ok' }),
    });
    // Mastra Tool constructor coerces undefined/false → false at tool.ts:262
    // (`this.requireApproval = opts.requireApproval || false`).
    expect((tool as unknown as { requireApproval?: unknown }).requireApproval).toBe(false);
  });

  it('passes function-form needsApproval through unchanged (Mastra native: requireApproval may be a predicate)', () => {
    const predicate = async (input: { isDryRun: boolean }) => !input.isDryRun;
    const tool = defineCopilotTool({
      id: 'x_conditional',
      name: 'Conditional Tool',
      description: 'Approves only non-dry-run calls.',
      input: z.object({ isDryRun: z.boolean() }),
      output: z.object({ ok: z.boolean() }),
      rbac: 'x.write',
      needsApproval: predicate,
      execute: async () => ({ ok: true }),
    });
    // Function-form predicate must arrive on the Tool instance as a function
    // (Mastra evaluates it per-call inside tool-call-step.ts:373-388).
    const ra = (tool as unknown as { requireApproval?: unknown }).requireApproval;
    expect(typeof ra).toBe('function');
    expect(ra).toBe(predicate);
  });

  it('accepts a numeric executionTimeoutMs and produces a Mastra tool with displayName intact', () => {
    const tool = defineCopilotTool({
      id: 'x_slow',
      name: 'Slow Tool',
      description: 'Takes a while.',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      executionTimeoutMs: 120_000,
      execute: async () => ({ ok: true }),
    });
    expect((tool as unknown as { displayName?: string }).displayName).toBe('Slow Tool');
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
