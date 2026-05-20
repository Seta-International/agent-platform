import { z } from 'zod';
import type { CopilotTool } from './_types.ts';

const Input = z.object({});

export const serverTimeTool: CopilotTool<typeof Input> = {
  name: 'core.serverTime',
  description: 'Returns the current server time as ISO-8601.',
  inputSchema: Input,
  requiredPermission: 'copilot.chat.use',
  execute: async () => ({ iso: new Date().toISOString() }),
};
