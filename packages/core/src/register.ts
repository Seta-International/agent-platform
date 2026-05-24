import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreAgentTools } from './agent-tools.ts';
import type { ContributionRegistry } from './composition/registry.ts';
import * as schema from './db/schema/index.ts';
import { invalidateUserSessions } from './session/invalidate.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCoreContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'core',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    agentTools: coreAgentTools,
    subscribers: [
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
      {
        event: 'identity.user.sso_revoked',
        subscription: 'core.session-invalidate-by-sso-revoke',
        eventVersion: 1,
        handler: async (e) => {
          await invalidateUserSessions((e.payload as { user_id: string }).user_id);
        },
      },
      {
        event: 'identity.user.email.changed',
        subscription: 'core.session-invalidate-by-email-change',
        eventVersion: 1,
        handler: async (e) => {
          await invalidateUserSessions((e.payload as { user_id: string }).user_id);
        },
      },
    ],
  });
}
