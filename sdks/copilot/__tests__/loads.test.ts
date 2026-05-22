import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCopilotTool } from '../src/index.ts';

describe('@seta/copilot-sdk', () => {
  it('defineCopilotTool returns the tool descriptor unchanged', () => {
    const tool = defineCopilotTool({
      id: 'test.echo',
      description: 'Echo back',
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      rbac: [],
      execute: async (input) => input,
    });
    expect(tool.id).toBe('test.echo');
  });
});
