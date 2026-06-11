import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/agent-sdk';
import { z } from 'zod';

const inputSchema = z.object({});
const outputSchema = z.object({ iso: z.string() });

export const serverTimeSpec: CrossModuleReadToolSpec<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  id: 'core_serverTime',
  description:
    'Returns the current server time as ISO-8601.\n\n' +
    'Use for: relative date calculations ("what tasks are due this week?"); anchoring date ' +
    'comparisons when the client has not provided a timestamp.',
  inputSchema,
  outputSchema,
  rbac: 'agent.chat.use',
  availableTo: 'all-specialists',
  execute: async () => ({ iso: new Date().toISOString() }),
};

export const serverTimeTool = defineCrossModuleReadAsTool({
  id: serverTimeSpec.id,
  name: 'Server Time',
  description: serverTimeSpec.description,
  inputSchema,
  outputSchema,
  rbac: serverTimeSpec.rbac,
  execute: serverTimeSpec.execute,
});
