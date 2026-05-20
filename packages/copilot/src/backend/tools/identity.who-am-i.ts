import { createTool } from '@mastra/core/tools';
import { whoAmI } from '@seta/identity';
import { z } from 'zod';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

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
