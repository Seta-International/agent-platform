import { makeToolContext } from '@seta/agent-sdk/testing';
import { describe, expect, it } from 'vitest';
import { buildMockTools, requireMockTool } from '../../src/tool-mock.ts';

describe('buildMockTools', () => {
  it('builds an executable tool that returns the canned response', async () => {
    const tools = buildMockTools([
      { toolId: 'demo_lookup', respond: (input) => ({ echoed: input }) },
    ]);
    const tool = tools[0];
    if (!tool) throw new Error('expected buildMockTools to return one tool');
    // AgentTool wraps a Mastra tool; its id must match the mocked tool id.
    expect((tool as { id: string }).id).toBe('demo_lookup');
    // defineAgentTool wraps execute with timeout/breaker/tenant-context
    // plumbing (sdks/agent/src/wrap-execute.ts), which requires a real Mastra
    // RequestContext carrying an actor + tenant_id — an empty `{}` ctx would
    // fail requestContext-schema validation before the canned respond() ever
    // runs. Use the SDK's own test helper to build a genuine ctx, so this is
    // a real execute call through the real wrapper, not a bypass.
    const out = await tool.execute({ q: 'hi' }, makeToolContext({ user_id: 'u1' }));
    expect(out).toEqual({ echoed: { q: 'hi' } });
  });
});

describe('requireMockTool', () => {
  it('returns the mock whose id matches', () => {
    const tools = buildMockTools([
      { toolId: 'a_tool', respond: () => 1 },
      { toolId: 'b_tool', respond: () => 2 },
    ]);
    expect((requireMockTool(tools, 'b_tool') as { id: string }).id).toBe('b_tool');
  });

  it('throws a self-describing error when the id is not mocked', () => {
    const tools = buildMockTools([{ toolId: 'a_tool', respond: () => 1 }]);
    expect(() => requireMockTool(tools, 'missing_tool')).toThrow(/no tool mock for 'missing_tool'/);
  });
});
