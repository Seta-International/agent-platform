import { describe, expect, it } from 'vitest';
import { makeTaskAnalyzerAgent } from '../../../../src/backend/orchestration/agents/task-analyzer.ts';
import type {
  TaskReaderPort,
  TaskSearchPort,
} from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };
const taskReader: TaskReaderPort = {
  async load() {
    return null;
  },
};
const taskSearch: TaskSearchPort = {
  async bySkillTags() {
    return [];
  },
};
const base = { taskReader, taskSearch, resolveModel: () => ({}) as never };

describe('taskAnalyzer agent', () => {
  it("returns a task's own skill_tags (fetchTaskData)", async () => {
    const agent = makeTaskAnalyzerAgent({
      ...base,
      runAgent: async () => ({
        toolCalls: [{ payload: { toolName: 'fetchTaskData', args: { taskId: 't-1' } } }],
        toolResults: [
          {
            payload: {
              toolName: 'fetchTaskData',
              result: {
                taskId: 't-1',
                title: 'AWS',
                description: 'x',
                skillTags: ['aws', 'terraform'],
                found: true,
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run({ query: 'what skills does this need', taskId: 't-1' }, ctx);
    expect(res.result.skills).toEqual(['aws', 'terraform']);
    expect(res.result.tasks).toBeUndefined();
  });

  it('falls back to extractRequirement when the task has no skill_tags', async () => {
    const agent = makeTaskAnalyzerAgent({
      ...base,
      runAgent: async () => ({
        toolCalls: [
          { payload: { toolName: 'fetchTaskData', args: { taskId: 't-1' } } },
          { payload: { toolName: 'extractRequirement', args: {} } },
        ],
        toolResults: [
          {
            payload: {
              toolName: 'fetchTaskData',
              result: { taskId: 't-1', title: 'AWS', description: 'x', skillTags: [], found: true },
            },
          },
          { payload: { toolName: 'extractRequirement', result: { skills: ['aws'] } } },
        ],
      }),
    });
    const res = await agent.run({ query: 'what skills', taskId: 't-1' }, ctx);
    expect(res.result.skills).toEqual(['aws']);
  });

  it('returns a task list (extractSkillTag + findTaskBySkillTag)', async () => {
    const agent = makeTaskAnalyzerAgent({
      ...base,
      runAgent: async () => ({
        toolCalls: [
          { payload: { toolName: 'extractSkillTag', args: { query: 'find infra' } } },
          { payload: { toolName: 'findTaskBySkillTag', args: { tags: ['infrastructure'] } } },
        ],
        toolResults: [
          { payload: { toolName: 'extractSkillTag', result: { tags: ['infrastructure'] } } },
          {
            payload: {
              toolName: 'findTaskBySkillTag',
              result: {
                tasks: [
                  {
                    taskId: 't9',
                    title: 'Infra A',
                    status: 'not_started',
                    skillTags: ['infrastructure'],
                  },
                ],
              },
            },
          },
        ],
      }),
    });
    const res = await agent.run({ query: 'find infrastructure tasks', taskId: null }, ctx);
    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.tasks?.[0]?.title).toBe('Infra A');
    expect(res.result.skills).toBeUndefined();
    expect(res.trust.evidenceCitations.some((c) => c.id === 't9')).toBe(true);
  });
});
