import { describe, expect, it, vi } from 'vitest';
import { wrapUpdateWorkingMemoryTool } from '../../src/working-memory-guard.ts';

function fakeInnerTool() {
  const calls: Array<{ memory: string }> = [];
  const execute = vi.fn(async (input: { memory: string }) => {
    calls.push(input);
    return { success: true };
  });
  return {
    tool: { id: 'updateWorkingMemory', execute } as never,
    calls,
    execute,
  };
}

const SOFT = '{"userContext": {"timezone": "Asia/Ho_Chi_Minh"}}';
const ENTITIES_ONLY = '{"entities": {"recentTasks": [{"taskId":"bad"}]}}';
const MIXED = '{"userContext": {"notes": "x"}, "entities": {"lastDiscussedTaskId": "any"}}';

describe('wrapUpdateWorkingMemoryTool', () => {
  it('forwards writes to userContext untouched', async () => {
    const { tool, calls } = fakeInnerTool();
    const wrapped = wrapUpdateWorkingMemoryTool(tool);
    await wrapped.execute({ memory: SOFT } as never, {} as never);
    expect(JSON.parse(calls[0].memory)).toEqual({ userContext: { timezone: 'Asia/Ho_Chi_Minh' } });
  });

  it('strips entities.* keys silently', async () => {
    const { tool, calls } = fakeInnerTool();
    const wrapped = wrapUpdateWorkingMemoryTool(tool);
    await wrapped.execute({ memory: MIXED } as never, {} as never);
    const forwarded = JSON.parse(calls[0].memory);
    expect(forwarded).toEqual({ userContext: { notes: 'x' } });
    expect(forwarded.entities).toBeUndefined();
  });

  it('returns a no-op success when only entity writes were attempted', async () => {
    const { tool, execute } = fakeInnerTool();
    const wrapped = wrapUpdateWorkingMemoryTool(tool);
    const result = await wrapped.execute({ memory: ENTITIES_ONLY } as never, {} as never);
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true });
  });

  it('returns structured error on malformed JSON instead of silently storing string', async () => {
    const { tool, execute } = fakeInnerTool();
    const wrapped = wrapUpdateWorkingMemoryTool(tool);
    const result = await wrapped.execute({ memory: 'not json' } as never, {} as never);
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false });
  });

  it('preserves the inner tool id/description so Mastra still wires it as updateWorkingMemory', () => {
    const { tool } = fakeInnerTool();
    const wrapped = wrapUpdateWorkingMemoryTool(tool);
    expect((wrapped as { id: string }).id).toBe('updateWorkingMemory');
  });
});
