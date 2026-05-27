import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertNoSessionField } from '../../src/registry-assertions.ts';

describe('assertNoSessionField', () => {
  it('passes for a schema with no session field', () => {
    expect(() =>
      assertNoSessionField(z.object({ taskId: z.string() }), 'assignBySkill'),
    ).not.toThrow();
  });

  it('throws on a schema with a top-level session field', () => {
    expect(() =>
      assertNoSessionField(
        z.object({ taskId: z.string(), session: z.object({ tenantId: z.string() }) }),
        'assignBySkill',
      ),
    ).toThrow(/session.*LLM-visible/i);
  });

  it('error message names the offending workflow id', () => {
    expect(() => assertNoSessionField(z.object({ session: z.object({}) }), 'myWorkflow')).toThrow(
      /myWorkflow/,
    );
  });
});
