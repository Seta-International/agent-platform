import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';
import { whoAmI } from '../domain/who-am-i.ts';

const outputSchema = z.object({
  user_id: z.string(),
  tenant_id: z.string(),
  display_name: z.string(),
  email: z.string(),
  availability_status: z.enum(['available', 'busy', 'ooo']),
  ooo_until: z.date().nullable(),
  timezone: z.string(),
  working_hours: z.object({ start: z.string(), end: z.string() }).nullable(),
  skills: z.array(z.string()).readonly(),
  role: z.string().nullable(),
  updated_at: z.date(),
  deactivated_at: z.date().nullable(),
});

export const whoAmITool = defineCopilotTool({
  id: 'identity_whoAmI',
  name: 'Look Up My Profile',
  description: "Returns the current user's profile (display name, email, tenant, availability).",
  input: z.object({}),
  output: outputSchema,
  rbac: 'identity.user.read.self',
  execute: async (_input, ctx) => {
    const actor = actorFromContext(ctx);
    const profile = await whoAmI(actor);
    if (!profile) throw new Error('profile_not_found');
    return profile;
  },
});
