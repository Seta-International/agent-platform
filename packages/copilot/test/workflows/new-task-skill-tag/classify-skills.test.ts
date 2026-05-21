import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { classifySkillsAgent } from '../../../src/backend/workflows/new-task-skill-tag/agents/classify-skills.ts';

const outputSchema = z.object({
  requiredSkills: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .min(3)
    .max(7),
});

const llmDescribe = process.env.OPENAI_API_KEY ? describe : describe.skip;

llmDescribe('classify-skills agent (real LLM)', () => {
  it('returns 3-7 lowercase skill tags for database task', async () => {
    const result = await classifySkillsAgent.generate(
      [
        {
          role: 'user',
          content:
            'Title: Tune Postgres write throughput\nDescription: Tail latency spikes during peak hours',
        },
      ],
      {
        structuredOutput: {
          schema: outputSchema,
        },
      },
    );

    expect(result.error).toBeUndefined();
    const output = await result.object;
    expect(Array.isArray(output.requiredSkills)).toBe(true);
    expect(output.requiredSkills.length).toBeGreaterThanOrEqual(3);
    expect(output.requiredSkills.length).toBeLessThanOrEqual(7);
    output.requiredSkills.forEach((skill) => {
      expect(skill).toMatch(/^[a-z0-9-]+$/);
    });
  });

  it('returns 3-7 lowercase skill tags for frontend task', async () => {
    const result = await classifySkillsAgent.generate(
      [
        {
          role: 'user',
          content:
            'Title: Add dark mode toggle\nDescription: Implement theme switching using CSS variables and React context',
        },
      ],
      {
        structuredOutput: {
          schema: outputSchema,
        },
      },
    );

    expect(result.error).toBeUndefined();
    const output = await result.object;
    expect(Array.isArray(output.requiredSkills)).toBe(true);
    expect(output.requiredSkills.length).toBeGreaterThanOrEqual(3);
    expect(output.requiredSkills.length).toBeLessThanOrEqual(7);
    output.requiredSkills.forEach((skill) => {
      expect(skill).toMatch(/^[a-z0-9-]+$/);
    });
  });
});

describe('classify-skills agent (deterministic mock)', () => {
  it('returns mocked structured output', async () => {
    const mockOutput = {
      object: { requiredSkills: ['postgres', 'sql-tuning', 'observability'] },
      error: undefined,
      text: '',
      toolResults: [],
      finishReason: 'stop' as const,
      usage: { promptTokens: 0, completionTokens: 0 },
      response: {
        id: 'mock-id',
        timestamp: new Date(),
        modelId: 'mock-model',
      },
      steps: [],
      warnings: undefined,
      providerMetadata: undefined,
      request: { body: '' },
      reasoning: undefined,
      reasoningText: undefined,
      toolCalls: [],
      sources: [],
      files: [],
      totalUsage: { promptTokens: 0, completionTokens: 0 },
      tripwire: undefined,
    };
    const spy = vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue(mockOutput);

    const result = await classifySkillsAgent.generate(
      [{ role: 'user', content: 'Any task description' }],
      {
        structuredOutput: {
          schema: outputSchema,
        },
      },
    );

    const output = await result.object;
    expect(output.requiredSkills).toEqual(['postgres', 'sql-tuning', 'observability']);
    spy.mockRestore();
  });
});
