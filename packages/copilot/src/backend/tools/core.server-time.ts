import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RequestContextSchema, registerToolPermission } from './_types.ts';

export const serverTimeTool = registerToolPermission(
  createTool({
    id: 'core_serverTime',
    description: 'Returns the current server time as ISO-8601.',
    inputSchema: z.object({}),
    outputSchema: z.object({ iso: z.string() }),
    requestContextSchema: RequestContextSchema,
    execute: async () => ({ iso: new Date().toISOString() }),
  }),
  'copilot.chat.use',
);
