import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import { coreAgentTools } from './agent-tools.ts';
import { CORE_SKILL_EVENTS } from './backend/skills/events.ts';
import type { ContributionRegistry } from './composition/registry.ts';
import * as schema from './db/schema/index.ts';
import { coreRbac } from './rbac.ts';
import { invalidateUserSessions } from './session/invalidate.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const eventsRetention = process.env.EVENTS_RETENTION_DAYS
  ? `${Number(process.env.EVENTS_RETENTION_DAYS)} days`
  : '365 days';

export function registerCoreContributions(reg: ContributionRegistry): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per
  // process), but the shared-db lifecycle registry is process-global and throws on
  // re-registering a table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'core.events')) {
    registerLifecycle([
      { table: 'core.events', policy: { kind: 'partition-drop', olderThan: eventsRetention } },
      {
        table: 'core.subscription_processed',
        policy: {
          kind: 'custom',
          run: async (pool) => {
            // rows at or below every subscriber's cursor can never be re-checked — trim them
            await pool.query(`
            DELETE FROM core.subscription_processed p
             USING core.subscription_cursors c
             WHERE c.subscription = p.subscription
               AND p.event_id IN (
                 SELECT e.id FROM core.events e
                  WHERE e.id = p.event_id
                    AND (e.occurred_at, e.id) <= (c.last_processed_occurred_at, c.last_processed_event_id))`);
          },
        },
      },
      {
        table: 'core.subscription_dead_letter',
        policy: { kind: 'ttl', column: 'dead_lettered_at', olderThan: '90 days' },
      },
      {
        table: 'core.rpc_idempotency',
        policy: { kind: 'ttl', column: 'created_at', olderThan: '30 days' },
      },
      {
        table: 'core.session_scope_cache',
        policy: {
          kind: 'custom',
          run: async (pool) => {
            await pool.query(
              `DELETE FROM core.session_scope_cache WHERE invalidated_at IS NOT NULL AND invalidated_at < now() - interval '7 days'`,
            );
          },
        },
      },
      {
        table: 'core.outgoing_emails',
        policy: {
          kind: 'custom',
          run: async (pool) => {
            await pool.query(
              `DELETE FROM core.outgoing_emails WHERE status = 'sent' AND sent_at < now() - interval '180 days'`,
            );
          },
        },
      },
      { table: 'core.tenants', policy: { kind: 'permanent' } },
      { table: 'core.skill', policy: { kind: 'permanent' } },
      { table: 'core.skill_category', policy: { kind: 'permanent' } },
      { table: 'core.subscription_cursors', policy: { kind: 'permanent' } },
      { table: 'core.subscription_failure_state', policy: { kind: 'permanent' } },
    ]);
  }

  reg.module({
    name: 'core',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: { ...CORE_SKILL_EVENTS },
    rbac: coreRbac,
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
