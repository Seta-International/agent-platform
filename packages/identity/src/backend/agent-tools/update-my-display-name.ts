import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';
import { updateMyDisplayName } from '../domain/update-my-display-name.ts';

export const updateMyDisplayNameTool = defineCopilotTool({
  id: 'identity_updateMyDisplayName',
  name: 'Update My Display Name',
  description: 'Renames the current user. Requires explicit user approval before applying.',
  input: z.object({
    displayName: z.string().trim().min(1).max(120),
  }),
  output: z.object({
    ok: z.boolean(),
    displayName: z.string(),
  }),
  rbac: 'identity.user.write.self',
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    await updateMyDisplayName(actor, input);
    return { ok: true, displayName: input.displayName };
  },
});
