import { updateMyDisplayName } from '@seta/identity';
import { z } from 'zod';
import type { CopilotTool } from './_types.ts';

const Input = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const updateMyDisplayNameTool: CopilotTool<typeof Input> = {
  name: 'identity.updateMyDisplayName',
  description: 'Renames the current user. Requires explicit user approval before applying.',
  inputSchema: Input,
  requiredPermission: 'identity.user.write.self',
  needsApproval: true,
  execute: async (actor, input) => {
    await updateMyDisplayName(actor, input);
    return { ok: true, displayName: input.displayName };
  },
};
