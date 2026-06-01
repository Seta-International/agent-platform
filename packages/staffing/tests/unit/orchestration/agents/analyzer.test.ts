import { describe, expect, it } from 'vitest';
import { makeAnalyzerAgent } from '../../../../src/backend/orchestration/agents/analyzer.ts';
import type {
  SkillExtractorPort,
  TaskReaderPort,
} from '../../../../src/backend/orchestration/ports.ts';

const CTX = { tenantId: 't1', actorUserId: 'u1' };

const taskReader = (info: Awaited<ReturnType<TaskReaderPort['load']>>): TaskReaderPort => ({
  load: async () => info,
});
const extractor = (
  out: Awaited<ReturnType<SkillExtractorPort['extract']>>,
): SkillExtractorPort => ({
  extract: async () => out,
});

describe('analyzer agent', () => {
  it('returns actionable skills with a task and is non-terminal', async () => {
    const agent = makeAnalyzerAgent({
      taskReader: taskReader({
        taskId: 'task-1',
        title: 'Stripe webhook',
        description: 'x',
        groupId: 'g1',
      }),
      skillExtractor: extractor({ actionable: true, skills: ['stripe', 'webhooks'] }),
    });
    const res = await agent.run({ userText: 'who can take this', taskId: 'task-1' }, CTX);
    expect(res.terminal).not.toBe(true);
    expect(res.result).toMatchObject({
      actionable: true,
      taskId: 'task-1',
      skills: ['stripe', 'webhooks'],
    });
    expect(res.trust.confidenceScore).toBeGreaterThan(0.5);
    expect(res.trust.evidenceCitations.some((c) => c.kind === 'task' && c.id === 'task-1')).toBe(
      true,
    );
  });

  it('terminates when the extractor says the message is not a staffing request', async () => {
    const agent = makeAnalyzerAgent({
      taskReader: taskReader(null),
      skillExtractor: extractor({ actionable: false, skills: [], reason: 'general chit-chat' }),
    });
    const res = await agent.run({ userText: 'hello there', taskId: null }, CTX);
    expect(res.terminal).toBe(true);
    expect(res.result).toMatchObject({ actionable: false, message: 'general chit-chat' });
  });

  it('terminates when actionable but no task can be resolved', async () => {
    const agent = makeAnalyzerAgent({
      taskReader: taskReader(null),
      skillExtractor: extractor({ actionable: true, skills: ['x'] }),
    });
    const res = await agent.run({ userText: 'suggest someone', taskId: null }, CTX);
    expect(res.terminal).toBe(true);
    expect((res.result as { actionable: boolean }).actionable).toBe(false);
  });
});
