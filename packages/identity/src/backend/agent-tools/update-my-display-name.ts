import { createTool } from '@mastra/core/tools';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
import { z } from 'zod';
import { updateMyDisplayName } from '../domain/update-my-display-name.ts';

export const updateMyDisplayNameTool = registerToolPermission(
  createTool({
    id: 'identity_updateMyDisplayName',
    description: 'Renames the current user. Requires explicit user approval before applying.',
    inputSchema: z.object({
      displayName: z.string().trim().min(1).max(120),
    }),
    requestContextSchema: RequestContextSchema,
    requireApproval: true,
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      await updateMyDisplayName(actor, input);
      return { ok: true, displayName: input.displayName };
    },
  }),
  'identity.user.write.self',
);
