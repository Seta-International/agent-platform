import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from './composition/registry.ts';
import * as schema from './db/schema/index.ts';
import { invalidateUserSessions } from './session/invalidate.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCoreContributions(reg: ContributionRegistry): void {
  reg.schema('core', schema);
  reg.migrationsDir('core', resolve(__dirname, '../drizzle/migrations'));
  reg.subscribers([
    {
      event: 'identity.role_grant.changed',
      subscription: 'core.session-invalidate-by-grant',
      eventVersion: 1,
      handler: async (e) => {
        await invalidateUserSessions((e.payload as { user_id: string }).user_id);
      },
    },
    {
      event: 'identity.user.deactivated',
      subscription: 'core.session-invalidate-by-deactivation',
      eventVersion: 1,
      handler: async (e) => {
        await invalidateUserSessions((e.payload as { user_id: string }).user_id);
      },
    },
    {
      event: 'identity.user.profile.updated',
      subscription: 'core.session-invalidate-by-profile',
      eventVersion: 1,
      handler: async (e) => {
        const payload = e.payload as { after: Record<string, unknown>; user_id: string };
        if ('display_name' in payload.after) {
          await invalidateUserSessions(payload.user_id);
        }
      },
    },
  ]);
  reg.publicApi('core', {});
}
