import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
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

export const whoAmITool = defineAgentTool({
  id: 'identity_whoAmI',
  name: 'Look Up My Profile',
  description:
    'Read your own profile: display name, email, skills, timezone, and availability.\n\n' +
    'Use for: "who am I?"; "what are my skills?"; getting your own userId to exclude yourself ' +
    'from candidate lists; "am I available this week?".\n' +
    'Call once at the start of any turn that references "me" or "I" — result is cheap and can ' +
    'be reused within the turn.',
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
