import { defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

export const serverTimeTool = defineCopilotTool({
  id: 'core_serverTime',
  name: 'Server Time',
  description: 'Returns the current server time as ISO-8601.',
  input: z.object({}),
  output: z.object({ iso: z.string() }),
  rbac: 'copilot.chat.use',
  execute: async () => ({ iso: new Date().toISOString() }),
});
