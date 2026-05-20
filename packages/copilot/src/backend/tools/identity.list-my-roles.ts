import { listMyEffectivePermissions } from '@seta/identity';
import { z } from 'zod';
import type { CopilotTool } from './_types.ts';

const Input = z.object({});

export const listMyRolesTool: CopilotTool<typeof Input> = {
  name: 'identity.listMyRoles',
  description: 'Returns the sorted union of permissions the current user effectively holds.',
  inputSchema: Input,
  requiredPermission: 'identity.user.read.self',
  execute: async (actor) => {
    const permissions = await listMyEffectivePermissions(actor);
    return { permissions };
  },
};
