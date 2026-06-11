import { describe, expect, it } from 'vitest';
import { makeTaskAnalyzerAgent } from '../../../../src/backend/orchestration/agents/task-analyzer.ts';
import type {
  TaskInfo,
  TaskReaderPort,
  TaskSearchPort,
} from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };

/** Port spies: count calls so we can assert which path the agent took. */
function spyReader(task: TaskInfo | null) {
  const calls: string[] = [];
  const port: TaskReaderPort = {
    async load(taskId) {
      calls.push(taskId);
      return task && { ...task, taskId };
    },
  };
  return { port, calls };
}
function spySearch(tasks: Awaited<ReturnType<TaskSearchPort['bySkillTags']>>) {
  const calls: string[][] = [];
  const limits: number[] = [];
  const port: TaskSearchPort = {
    async bySkillTags(tags, limit) {
      calls.push(tags);
      limits.push(limit);
      return tasks.map((t) => ({ ...t, skillTags: tags }));
    },
    async listAvailableTags() {
      return [];
    },
  };
  return { port, calls, limits };
}

const TASK = (skillTags: string[]): TaskInfo => ({
  taskId: 't-1',
  title: 'AWS migration',
  description: 'lift and shift',
  groupId: 'g1',
  skillTags,
});

describe('taskAnalyzer agent (intent-routed, deterministic)', () => {
  it('extract_named_skills: extracts skills from the query ONLY — no task read, no task search', async () => {
    const reader = spyReader(null);
    const search = spySearch([]);
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
      extractTagsFromQuery: async () => ['aws', 'k8s'],
    });

    const res = await agent.run(
      {
        intent: 'extract_named_skills',
        query: 'who has skills in aws and k8s',
        taskId: 't-1',
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.skills).toEqual(['aws', 'k8s']);
    expect(res.result.tasks).toBeUndefined();
    // The whole point of the fix: this intent must NOT touch task data or search.
    expect(reader.calls).toEqual([]);
    expect(search.calls).toEqual([]);
  });

  it('find_tasks: extracts tags then searches tasks — returns tasks, not skills', async () => {
    const reader = spyReader(null);
    const search = spySearch([
      { taskId: 't9', title: 'Infra A', status: 'not_started', skillTags: [] },
    ]);
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
      extractTagsFromQuery: async () => ['infrastructure'],
    });

    const res = await agent.run(
      {
        intent: 'find_tasks',
        query: 'find infrastructure tasks',
        taskId: null,
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.tasks?.[0]?.title).toBe('Infra A');
    expect(res.result.skills).toBeUndefined();
    expect(search.calls).toEqual([['infrastructure']]);
    expect(reader.calls).toEqual([]);
    expect(res.trust.evidenceCitations.some((c) => c.id === 't9')).toBe(true);
    // No explicit limit → the agent default reaches the search port.
    expect(search.limits).toEqual([20]);
  });

  it('find_tasks: passes the requested limit through to the search port', async () => {
    const search = spySearch([
      { taskId: 't9', title: 'Infra A', status: 'not_started', skillTags: [] },
    ]);
    const agent = makeTaskAnalyzerAgent({
      taskReader: spyReader(null).port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
      extractTagsFromQuery: async () => ['infrastructure'],
    });

    await agent.run(
      {
        intent: 'find_tasks',
        query: 'find 5 infrastructure tasks',
        taskId: null,
        completionStatus: 'open' as const,
        limit: 5,
      },
      ctx,
    );

    expect(search.limits).toEqual([5]);
  });

  it('find_tasks: empty tags → no search, empty task list', async () => {
    const search = spySearch([]);
    const agent = makeTaskAnalyzerAgent({
      taskReader: spyReader(null).port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
      extractTagsFromQuery: async () => [],
    });

    const res = await agent.run(
      {
        intent: 'find_tasks',
        query: 'hello there',
        taskId: null,
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.tasks).toEqual([]);
    expect(search.calls).toEqual([]); // never search with empty tags
  });

  it("resolve_task_skills: returns the task's own skill_tags — no extraction, no search", async () => {
    const reader = spyReader(TASK(['aws', 'terraform']));
    const search = spySearch([]);
    let extractCalls = 0;
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
      extractSkillsFromTask: async () => {
        extractCalls += 1;
        return ['ignored'];
      },
    });

    const res = await agent.run(
      {
        intent: 'resolve_task_skills',
        query: 'what skills does this need',
        taskId: 't-1',
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.skills).toEqual(['aws', 'terraform']);
    expect(res.result.tasks).toBeUndefined();
    expect(reader.calls).toEqual(['t-1']);
    expect(extractCalls).toBe(0); // task had its own tags → no LLM extraction
    expect(search.calls).toEqual([]);
  });

  it('resolve_task_skills: falls back to extractRequirement when the task has no skill_tags', async () => {
    const reader = spyReader(TASK([]));
    let extractCalls = 0;
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: spySearch([]).port,
      resolveModel: () => ({}) as never,
      extractSkillsFromTask: async () => {
        extractCalls += 1;
        return ['aws'];
      },
    });

    const res = await agent.run(
      {
        intent: 'resolve_task_skills',
        query: 'what skills',
        taskId: 't-1',
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.skills).toEqual(['aws']);
    expect(extractCalls).toBe(1);
  });

  it('resolve_task_skills: missing taskId → empty result (no crash)', async () => {
    const reader = spyReader(TASK(['aws']));
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: spySearch([]).port,
      resolveModel: () => ({}) as never,
    });

    const res = await agent.run(
      {
        intent: 'resolve_task_skills',
        query: 'what skills',
        taskId: null,
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.skills).toBeUndefined();
    expect(res.result.tasks).toBeUndefined();
    expect(reader.calls).toEqual([]); // nothing to load
  });

  it('resolve_task_skills: task not found → empty result', async () => {
    const reader = spyReader(null);
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: spySearch([]).port,
      resolveModel: () => ({}) as never,
    });

    const res = await agent.run(
      {
        intent: 'resolve_task_skills',
        query: 'what skills',
        taskId: 't-404',
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.skills).toBeUndefined();
    expect(reader.calls).toEqual(['t-404']);
  });

  it('resolve_task_skills: includes the task title for downstream card headers', async () => {
    const reader = spyReader(TASK(['aws']));
    const search = spySearch([]);
    const agent = makeTaskAnalyzerAgent({
      taskReader: reader.port,
      taskSearch: search.port,
      resolveModel: () => ({}) as never,
    });

    const res = await agent.run(
      {
        intent: 'resolve_task_skills',
        query: 'what skills does this need',
        taskId: 't-1',
        completionStatus: 'any' as const,
      },
      ctx,
    );

    expect(res.result.title).toBe('AWS migration');
    expect(res.result.skills).toEqual(['aws']);
  });
});
