import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { whoAmI } from '../domain/who-am-i.ts';

const outputSchema = z.object({
  user_id: z.string(),
  tenant_id: z.string(),
  display_name: z.string(),
  email: z.string(),
  updated_at: z.date(),
  deactivated_at: z.date().nullable(),
});

export const whoAmITool = defineAgentTool({
  id: 'identity_whoAmI',
  name: 'Look Up My Profile',
  description:
    'Read your own account: display name, email, and tenant.\n\n' +
    'Use for: "who am I?"; getting your own userId to exclude yourself ' +
    'from candidate lists.\n' +
    'Call once at the start of any turn that references "me" or "I" — result is cheap and can ' +
    'be reused within the turn.',
  input: z.object({}),
  output: outputSchema,
  rbac: 'identity.user.read.self',
  execute: async (_input, ctx) => {
    const actor = actorFromContext(ctx);
    const profile = await whoAmI(actor);
    if (!profile) throw new Error('profile_not_found');
    return {
      user_id: profile.user_id,
      tenant_id: profile.tenant_id,
      display_name: profile.display_name,
      email: profile.email,
      updated_at: profile.updated_at,
      deactivated_at: profile.deactivated_at,
    };
  },
});
