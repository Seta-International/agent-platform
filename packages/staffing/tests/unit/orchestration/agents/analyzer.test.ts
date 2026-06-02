import { describe, expect, it } from 'vitest';
import { makeAnalyzerAgent } from '../../../../src/backend/orchestration/agents/analyzer.ts';
import type { TaskReaderPort } from '../../../../src/backend/orchestration/ports.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };
const taskReader: TaskReaderPort = {
  async load(taskId) {
    return { taskId, title: 'AWS script', description: 'inventory', groupId: '' };
  },
};
const agentWith = (extraction: { actionable: boolean; skills: string[]; reason: string | null }) =>
  makeAnalyzerAgent({
    taskReader,
    resolveModel: () => ({}) as never,
    extract: async () => extraction,
  });

describe('analyzer', () => {
  it('terminal when not actionable', async () => {
    const res = await agentWith({ actionable: false, skills: [], reason: 'greeting' }).run(
      { userText: 'hi', taskId: null },
      ctx,
    );
    expect(res.terminal).toBe(true);
    expect(res.result.message).toBe('greeting');
  });
  it('terminal when actionable but no task', async () => {
    const res = await agentWith({ actionable: true, skills: ['aws'], reason: null }).run(
      { userText: 'who', taskId: null },
      ctx,
    );
    expect(res.terminal).toBe(true);
    expect(res.result.actionable).toBe(false);
  });
  it('non-terminal with skills + task', async () => {
    const res = await agentWith({ actionable: true, skills: ['aws'], reason: null }).run(
      { userText: 'who', taskId: 't-1' },
      ctx,
    );
    expect(res.terminal).toBeUndefined();
    expect(res.result.taskId).toBe('t-1');
    expect(res.result.skills).toEqual(['aws']);
  });
});
