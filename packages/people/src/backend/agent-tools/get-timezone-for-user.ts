import { type CrossModuleReadToolSpec, defineCrossModuleReadAsTool } from '@seta/agent-sdk';
import { z } from 'zod';
import { fetchPresenceByUserId } from '../domain/read-presence.ts';

const inputSchema = z.object({ userId: z.string().uuid() });
const outputSchema = z.object({ timezone: z.string() });

export type GetTimezoneInput = z.infer<typeof inputSchema>;
export type GetTimezoneOutput = z.infer<typeof outputSchema>;

export const peopleGetTimezoneSpec: CrossModuleReadToolSpec<GetTimezoneInput, GetTimezoneOutput> = {
  id: 'people_getTimezoneForUser',
  description:
    'Get the IANA timezone for a worker (e.g. "Asia/Ho_Chi_Minh").\n\n' +
    'Use for: timezone-overlap reasoning when assigning long-running collaborative work; ' +
    '"what timezone is X in?".\n' +
    'Do NOT use for availability status — use people_getAvailabilityForUser instead.\n' +
    'Defaults to UTC when no worker record is found for that user.',
  inputSchema,
  outputSchema,
  rbac: 'people.worker.read',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => {
    const parsed = inputSchema.parse(input);
    const result = await fetchPresenceByUserId(session.tenant_id, parsed.userId);
    return { timezone: result.timezone };
  },
};

export const peopleGetTimezoneTool = defineCrossModuleReadAsTool({
  id: peopleGetTimezoneSpec.id,
  name: 'Get Worker Timezone',
  description: peopleGetTimezoneSpec.description,
  inputSchema,
  outputSchema,
  rbac: peopleGetTimezoneSpec.rbac,
  execute: peopleGetTimezoneSpec.execute,
});
