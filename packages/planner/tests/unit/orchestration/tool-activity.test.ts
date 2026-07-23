import { expect, it } from 'vitest';
import { mapToolActivity } from '../../../src/backend/orchestration/tool-activity.ts';

it('maps Mastra tool-call/tool-result chunks into flat ToolActivity, matched by toolCallId', () => {
  const toolCalls = [
    { payload: { toolCallId: 'c1', toolName: 'planner_resolveMember', args: { name: 'Tuan' } } },
    { payload: { toolCallId: 'c2', toolName: 'planner_queryTasks', args: { userId: 'u-1' } } },
  ];
  const toolResults = [
    { payload: { toolCallId: 'c2', result: { count: 8 }, isError: false } },
    { payload: { toolCallId: 'c1', result: { userId: 'u-1' }, isError: false } },
  ];
  const out = mapToolActivity(toolCalls, toolResults);
  expect(out).toEqual([
    {
      toolName: 'planner_resolveMember',
      args: { name: 'Tuan' },
      result: { userId: 'u-1' },
      ok: true,
    },
    { toolName: 'planner_queryTasks', args: { userId: 'u-1' }, result: { count: 8 }, ok: true },
  ]);
});

it('marks ok=false when the matching result is an error, and ok=true when no result is present', () => {
  const out = mapToolActivity(
    [
      { payload: { toolCallId: 'c1', toolName: 'planner_queryTasks', args: {} } },
      { payload: { toolCallId: 'c2', toolName: 'planner_getStats', args: {} } },
    ],
    [{ payload: { toolCallId: 'c1', result: { error: 'boom' }, isError: true } }],
  );
  expect(out[0]!.ok).toBe(false);
  expect(out[1]!.ok).toBe(true);
  expect(out[1]!.result).toBeUndefined();
});

it('returns an empty array for missing inputs', () => {
  expect(mapToolActivity()).toEqual([]);
  expect(mapToolActivity([], [])).toEqual([]);
});
