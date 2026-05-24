import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';
import { listMyEffectivePermissions } from '../domain/list-my-effective-permissions.ts';

export const listMyRolesTool = defineCopilotTool({
  id: 'identity_listMyRoles',
  name: 'List My Roles',
  description: 'Returns the sorted union of permissions the current user effectively holds.',
  input: z.object({}),
  output: z.object({
    permissions: z.array(z.string()),
  }),
  rbac: 'identity.user.read.self',
  execute: async (_input, ctx) => {
    const actor = actorFromContext(ctx);
    const permissions = await listMyEffectivePermissions(actor);
    return { permissions };
  },
});
