import { createTool } from '@mastra/core/tools';
import { listMyEffectivePermissions } from '@seta/identity';
import { z } from 'zod';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

export const listMyRolesTool = registerToolPermission(
  createTool({
    id: 'identity_listMyRoles',
    description: 'Returns the sorted union of permissions the current user effectively holds.',
    inputSchema: z.object({}),
    requestContextSchema: RequestContextSchema,
    execute: async (_input, ctx) => {
      const actor = actorFromContext(ctx);
      const permissions = await listMyEffectivePermissions(actor);
      return { permissions };
    },
  }),
  'identity.user.read.self',
);
