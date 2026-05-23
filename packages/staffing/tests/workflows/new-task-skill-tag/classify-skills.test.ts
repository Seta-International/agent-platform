import { describe, expect, it, vi } from 'vitest';
import {
  classifySkillsAgent,
  classifySkillsOutputSchema,
} from '../../../src/backend/workflows/new-task-skill-tag/agents/classify-skills.ts';

const outputSchema = classifySkillsOutputSchema;

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
    const output = result.object;
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
    const output = result.object;
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
    } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>;
    const spy = vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue(mockOutput);

    const result = await classifySkillsAgent.generate(
      [{ role: 'user', content: 'Any task description' }],
      {
        structuredOutput: {
          schema: outputSchema,
        },
      },
    );

    const output = result.object;
    expect(output.requiredSkills).toEqual(['postgres', 'sql-tuning', 'observability']);
    spy.mockRestore();
  });
});
