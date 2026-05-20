import { whoAmI } from '@seta/identity';
import { z } from 'zod';
import type { CopilotTool } from './_types.ts';

const Input = z.object({});

export const whoAmITool: CopilotTool<typeof Input> = {
  name: 'identity.whoAmI',
  description: "Returns the current user's profile (display name, email, tenant, availability).",
  inputSchema: Input,
  requiredPermission: 'identity.user.read.self',
  execute: async (actor) => {
    const profile = await whoAmI(actor);
    if (!profile) throw new Error('profile_not_found');
    return profile;
  },
};
