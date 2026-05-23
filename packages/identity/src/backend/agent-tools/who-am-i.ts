import { createTool } from '@mastra/core/tools';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
import { z } from 'zod';
import { whoAmI } from '../domain/who-am-i.ts';

export const whoAmITool = registerToolPermission(
  createTool({
    id: 'identity_whoAmI',
    description: "Returns the current user's profile (display name, email, tenant, availability).",
    inputSchema: z.object({}),
    requestContextSchema: RequestContextSchema,
    execute: async (_input, ctx) => {
      const actor = actorFromContext(ctx);
      const profile = await whoAmI(actor);
      if (!profile) throw new Error('profile_not_found');
      return profile;
    },
  }),
  'identity.user.read.self',
);
