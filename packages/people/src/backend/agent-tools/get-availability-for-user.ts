import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { fetchPresenceByUserId } from '../domain/read-presence.ts';

const inputSchema = z.object({ userId: z.string().uuid() });

const availabilityStatusSchema = z.enum(['available', 'busy', 'ooo']);

const outputSchema = z.object({
  availability_status: availabilityStatusSchema,
  ooo_until: z.date().nullable(),
  working_hours: z.object({ start: z.string(), end: z.string() }).nullable(),
});

export type GetAvailabilityInput = z.infer<typeof inputSchema>;
export type GetAvailabilityOutput = z.infer<typeof outputSchema>;

export const peopleGetAvailabilitySpec: CrossModuleReadToolSpec<
  GetAvailabilityInput,
  GetAvailabilityOutput
> = {
  id: 'people_getAvailabilityForUser',
  description:
    "Check a worker's availability: status (available / busy / ooo), out-of-office end date, " +
    'and working hours.\n\n' +
    'Use for: filtering out OOO candidates before proposing assignment; "is X available this ' +
    'week?"; load-sensitive assignment decisions.\n' +
    'Do NOT use for timezone — use people_getTimezoneForUser instead.\n' +
    "Defaults to 'available' when no worker record exists for that user.",
  inputSchema,
  outputSchema,
  rbac: 'people.worker.read',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => {
    const parsed = inputSchema.parse(input);
    const result = await fetchPresenceByUserId(session.tenant_id, parsed.userId);
    return {
      availability_status: result.availability_status,
      ooo_until: result.ooo_until,
      working_hours: result.working_hours,
    };
  },
};

export const peopleGetAvailabilityTool = defineCrossModuleReadAsTool({
  id: peopleGetAvailabilitySpec.id,
  name: 'Get Worker Availability',
  description: peopleGetAvailabilitySpec.description,
  inputSchema,
  outputSchema,
  rbac: peopleGetAvailabilitySpec.rbac,
  execute: peopleGetAvailabilitySpec.execute,
});
