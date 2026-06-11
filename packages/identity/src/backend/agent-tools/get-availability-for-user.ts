import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/agent-sdk';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identityDb } from '../db/index.ts';
import { userProfile } from '../db/schema.ts';

const inputSchema = z.object({ userId: z.string().uuid() });

const availabilityStatusSchema = z.enum(['available', 'busy', 'ooo']);

const outputSchema = z.object({
  availability_status: availabilityStatusSchema,
  ooo_until: z.date().nullable(),
  working_hours: z.object({ start: z.string(), end: z.string() }).nullable(),
});

export type GetAvailabilityInput = z.infer<typeof inputSchema>;
export type GetAvailabilityOutput = z.infer<typeof outputSchema>;

/**
 * Cross-module read tool: returns the availability fields for a user
 * (status, ooo end date, working-hours window). Missing profile defaults to
 * 'available' with null ooo/hours so callers can rank conservatively.
 */
export const identityGetAvailabilitySpec: CrossModuleReadToolSpec<
  GetAvailabilityInput,
  GetAvailabilityOutput
> = {
  id: 'identity_getAvailabilityForUser',
  description:
    "Check a user's availability: status (available / busy / ooo), out-of-office end date, " +
    'and working hours.\n\n' +
    'Use for: filtering out OOO candidates before proposing assignment; "is X available this ' +
    'week?"; load-sensitive assignment decisions.\n' +
    'Do NOT use for timezone — use identity_getTimezoneForUser instead.\n' +
    "Defaults to 'available' when no profile exists.",
  inputSchema,
  outputSchema,
  rbac: 'identity.user.read',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => {
    const parsed = inputSchema.parse(input);
    const [row] = await identityDb()
      .select({
        availability_status: userProfile.availability_status,
        ooo_until: userProfile.ooo_until,
        working_hours: userProfile.working_hours,
      })
      .from(userProfile)
      .where(
        and(eq(userProfile.tenant_id, session.tenant_id), eq(userProfile.user_id, parsed.userId)),
      )
      .limit(1);
    if (!row) {
      return { availability_status: 'available' as const, ooo_until: null, working_hours: null };
    }
    return {
      availability_status: row.availability_status,
      ooo_until: row.ooo_until,
      working_hours: row.working_hours,
    };
  },
};

/**
 * LLM-visible Mastra tool wrapper that derives `session` from `requestContext`.
 * Specialists register this on their `tools` record; the underlying `*Spec`
 * remains the source of truth for non-LLM callers.
 */
export const identityGetAvailabilityTool = defineCrossModuleReadAsTool({
  id: identityGetAvailabilitySpec.id,
  name: 'Get Availability',
  description:
    "Check a user's availability: status (available / busy / ooo), out-of-office end date, " +
    'and working hours.\n\n' +
    'Use for: filtering out OOO candidates before proposing assignment; "is X available this ' +
    'week?"; load-sensitive assignment decisions.\n' +
    'Do NOT use for timezone — use identity_getTimezoneForUser instead.\n' +
    "Defaults to 'available' when no profile exists.",
  inputSchema,
  outputSchema,
  rbac: identityGetAvailabilitySpec.rbac,
  execute: identityGetAvailabilitySpec.execute,
});
