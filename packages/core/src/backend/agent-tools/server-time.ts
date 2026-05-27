import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';

export const serverTimeTool = defineAgentTool({
  id: 'core_serverTime',
  name: 'Server Time',
  description: 'Returns the current server time as ISO-8601.',
  input: z.object({}),
  output: z.object({ iso: z.string() }),
  rbac: 'agent.chat.use',
  execute: async () => ({ iso: new Date().toISOString() }),
});
