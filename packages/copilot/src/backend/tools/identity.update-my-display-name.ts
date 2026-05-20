import { createTool } from '@mastra/core/tools';
import { updateMyDisplayName } from '@seta/identity';
import { z } from 'zod';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

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
