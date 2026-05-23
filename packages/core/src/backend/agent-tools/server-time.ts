import { createTool } from '@mastra/core/tools';
import { RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
import { z } from 'zod';

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
