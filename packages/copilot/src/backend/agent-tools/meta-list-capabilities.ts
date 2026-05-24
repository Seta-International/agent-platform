import { CopilotRegistry, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

export const metaListCapabilitiesTool = defineCopilotTool({
  id: 'meta_listCapabilities',
  name: 'List Assistant Capabilities',
  description: 'Returns the list of domains, specialists, and workflows the assistant exposes.',
  input: z.object({}),
  output: z.object({
    domains: z.array(z.string()),
    specialists: z.array(z.object({ domain: z.string(), id: z.string(), description: z.string() })),
    workflows: z.array(z.object({ domain: z.string(), id: z.string(), description: z.string() })),
  }),
  rbac: 'copilot.meta.read.self',
  execute: async () => {
    const snap = CopilotRegistry.snapshot();
    return {
      domains: snap.domains,
      specialists: snap.specialists.map((s) => ({
        domain: s.domain as string,
        id: s.id,
        description: s.description,
      })),
      workflows: snap.workflows.map((w) => ({
        domain: w.domain as string,
        id: w.id,
        description: w.description,
      })),
    };
  },
});
