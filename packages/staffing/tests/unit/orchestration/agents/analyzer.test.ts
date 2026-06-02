import { describe, expect, it, vi } from 'vitest';
import { makeAnalyzerAgent } from '../../../../src/backend/orchestration/agents/analyzer.ts';
import type {
  TaskReaderPort,
  TaskSearchPort,
} from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };

const taskReaderWith = (skillTags: string[]): TaskReaderPort => ({
  async load(taskId) {
    return { taskId, title: 'AWS script', description: 'inventory', groupId: '', skillTags };
  },
});
const nullTaskReader: TaskReaderPort = {
  async load() {
    return null;
  },
};
const emptyTaskSearch: TaskSearchPort = {
  async bySkillTags() {
    return [];
  },
};

interface Extraction {
  intent: 'recommend_assignee' | 'find_tasks' | 'none';
  skills: string[];
  tags: string[];
  reason: string | null;
}

const agentWith = (
  extraction: Extraction,
  opts: { taskReader?: TaskReaderPort; taskSearch?: TaskSearchPort } = {},
) =>
  makeAnalyzerAgent({
    taskReader: opts.taskReader ?? taskReaderWith([]),
    taskSearch: opts.taskSearch ?? emptyTaskSearch,
    resolveModel: () => ({}) as never,
    extract: async () => extraction,
  });

describe('analyzer intent router', () => {
  it('none → terminal, not actionable, message = reason', async () => {
    const res = await agentWith({ intent: 'none', skills: [], tags: [], reason: 'greeting' }).run(
      { userText: 'hi', taskId: null },
      ctx,
    );
    expect(res.terminal).toBe(true);
    expect(res.result.actionable).toBe(false);
    expect(res.result.message).toBe('greeting');
  });

  it('recommend_assignee with a task that has skill_tags uses the tags (LLM skills ignored)', async () => {
    const res = await agentWith(
      { intent: 'recommend_assignee', skills: ['guessed'], tags: [], reason: null },
      { taskReader: taskReaderWith(['aws', 'terraform']) },
    ).run({ userText: 'who should take this', taskId: 't-1' }, ctx);
    expect(res.terminal).toBeUndefined();
    expect(res.result.actionable).toBe(true);
    expect(res.result.taskId).toBe('t-1');
    expect(res.result.skills).toEqual(['aws', 'terraform']);
  });

  it('recommend_assignee falls back to LLM skills when the task has no skill_tags', async () => {
    const res = await agentWith(
      { intent: 'recommend_assignee', skills: ['aws'], tags: [], reason: null },
      { taskReader: taskReaderWith([]) },
    ).run({ userText: 'who', taskId: 't-1' }, ctx);
    expect(res.result.actionable).toBe(true);
    expect(res.result.skills).toEqual(['aws']);
  });

  it('recommend_assignee with no resolvable task is terminal + not actionable', async () => {
    const res = await agentWith(
      { intent: 'recommend_assignee', skills: ['aws'], tags: [], reason: null },
      { taskReader: nullTaskReader },
    ).run({ userText: 'who', taskId: null }, ctx);
    expect(res.terminal).toBe(true);
    expect(res.result.actionable).toBe(false);
    expect(res.result.skills).toEqual(['aws']);
  });

  it('find_tasks searches by tags and returns a terminal task list', async () => {
    const search = vi.fn(async () => [
      {
        taskId: 't1',
        title: 'Infra A',
        status: 'not_started' as const,
        skillTags: ['infrastructure'],
      },
    ]);
    const res = await agentWith(
      { intent: 'find_tasks', skills: [], tags: ['infrastructure'], reason: null },
      { taskSearch: { bySkillTags: search }, taskReader: nullTaskReader },
    ).run({ userText: 'find infrastructure tasks', taskId: null }, ctx);

    expect(search).toHaveBeenCalledWith(['infrastructure'], 20, ctx);
    expect(res.terminal).toBe(true);
    expect(res.result.actionable).toBe(false);
    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.tasks![0]!.title).toBe('Infra A');
  });

  it('find_tasks with no extracted tags returns an empty list without searching', async () => {
    const search = vi.fn(async () => []);
    const res = await agentWith(
      { intent: 'find_tasks', skills: [], tags: [], reason: null },
      { taskSearch: { bySkillTags: search }, taskReader: nullTaskReader },
    ).run({ userText: 'find tasks', taskId: null }, ctx);

    expect(search).not.toHaveBeenCalled();
    expect(res.terminal).toBe(true);
    expect(res.result.tasks).toEqual([]);
  });
});
