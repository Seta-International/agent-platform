import { expect, it } from 'vitest';
import { TrajectoryCollector } from '../../fixtures/golden/trajectory-collector.ts';

it('merges two-tier records into a flat trajectory in record order', () => {
  const c = new TrajectoryCollector();
  c.record('planner.query.orchestrator', [
    { toolName: 'planner_queryTasksAgent', args: { q: 'Tuan tasks' }, ok: true },
  ]);
  c.record('planner.query.taskQuery', [
    {
      toolName: 'planner_resolveMember',
      args: { name: 'Tuan' },
      result: { userId: 'u-1' },
      ok: true,
    },
    { toolName: 'planner_queryTasks', args: { userId: 'u-1' }, ok: true },
  ]);
  const t = c.toTrajectory();
  expect(t.toolCalls.map((x) => x.toolName)).toEqual([
    'planner_queryTasksAgent',
    'planner_resolveMember',
    'planner_queryTasks',
  ]);
  expect(t.toolCalls[0]!.agentId).toBe('planner.query.orchestrator');
  expect(t.toolCalls[1]!.agentId).toBe('planner.query.taskQuery');
});

it('yields an empty trajectory when nothing was recorded', () => {
  expect(new TrajectoryCollector().toTrajectory()).toEqual({ toolCalls: [] });
});
