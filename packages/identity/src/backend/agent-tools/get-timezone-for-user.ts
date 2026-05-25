import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/copilot-sdk';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identityDb } from '../db/index.ts';
import { userProfile } from '../db/schema.ts';

const inputSchema = z.object({ userId: z.string().uuid() });
const outputSchema = z.object({ timezone: z.string() });

export type GetTimezoneInput = z.infer<typeof inputSchema>;
export type GetTimezoneOutput = z.infer<typeof outputSchema>;

/**
 * Cross-module read tool: returns the IANA timezone string for a user.
 * Defaults to 'UTC' if no profile row exists.
 */
export const identityGetTimezoneSpec: CrossModuleReadToolSpec<GetTimezoneInput, GetTimezoneOutput> =
  {
    id: 'identity_getTimezoneForUser',
    description:
      'Returns the IANA timezone string for a user. Defaults to UTC when no profile is set.',
    inputSchema,
    outputSchema,
    rbac: 'identity.user.read',
    availableTo: 'all-specialists',
    execute: async ({ session, input }) => {
      const parsed = inputSchema.parse(input);
      const [row] = await identityDb()
        .select({ tz: userProfile.timezone })
        .from(userProfile)
        .where(
          and(eq(userProfile.tenant_id, session.tenant_id), eq(userProfile.user_id, parsed.userId)),
        )
        .limit(1);
      return { timezone: row?.tz ?? 'UTC' };
    },
  };

/**
 * LLM-visible Mastra tool wrapper that derives `session` from `requestContext`.
 * Specialists register this on their `tools` record; the underlying `*Spec`
 * remains the source of truth for non-LLM callers.
 */
export const identityGetTimezoneTool = defineCrossModuleReadAsTool({
  id: identityGetTimezoneSpec.id,
  name: 'Get Timezone',
  description: identityGetTimezoneSpec.description,
  inputSchema,
  outputSchema,
  rbac: identityGetTimezoneSpec.rbac,
  execute: identityGetTimezoneSpec.execute,
});
