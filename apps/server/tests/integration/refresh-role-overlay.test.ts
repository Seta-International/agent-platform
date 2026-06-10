import { createContributionRegistry, runMigrations } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { sessionScopeCache } from '@seta/core/db/schema';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { IDENTITY_ROLE_PERMISSIONS_CHANGED } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { refreshRoleOverlaySubscriber } from '../../src/subscribers/refresh-role-overlay.ts';

describe('refreshRoleOverlaySubscriber', () => {
  it('refreshes the overlay store and invalidates only the tenant’s sessions', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenant = crypto.randomUUID();
          const otherTenant = crypto.randomUUID();
          const seed = (tenantId: string, sessionId: string) => ({
            session_id: sessionId,
            tenant_id: tenantId,
            user_id: crypto.randomUUID(),
            role_summary_hash: 'h',
            role_summary: { roles: [], cross_tenant_read: false },
            accessible_group_ids: [],
            cross_tenant_read: false,
            built_at: new Date(),
            invalidated_at: null,
          });
          await coreDb()
            .insert(sessionScopeCache)
            .values([seed(tenant, 's-target'), seed(otherTenant, 's-other')]);

          const refresh = vi.fn(async () => {});
          const sub = refreshRoleOverlaySubscriber({
            overlayStore: { get: async () => new Map(), refresh },
          });

          const event = {
            id: crypto.randomUUID(),
            occurredAt: new Date(),
            tenantId: tenant,
            aggregateType: 'identity.tenant',
            aggregateId: tenant,
            eventType: IDENTITY_ROLE_PERMISSIONS_CHANGED,
            eventVersion: 1,
            payload: {
              actor: { type: 'user' as const, user_id: crypto.randomUUID() },
              tenant_id: tenant,
              role_slug: 'knowledge.viewer',
            },
          } satisfies DomainEvent<{
            actor: { type: 'user'; user_id: string };
            tenant_id: string;
            role_slug: string;
          }>;

          await sub.handler(event, {} as SubscriberCtx);

          expect(refresh).toHaveBeenCalledWith(tenant);
          const [target] = await coreDb()
            .select()
            .from(sessionScopeCache)
            .where(eq(sessionScopeCache.session_id, 's-target'));
          const [other] = await coreDb()
            .select()
            .from(sessionScopeCache)
            .where(eq(sessionScopeCache.session_id, 's-other'));
          expect(target?.invalidated_at).not.toBeNull();
          expect(target?.invalidated_at).toBeInstanceOf(Date);
          expect(other?.invalidated_at).toBeNull();
        } finally {
          await closePools();
          resetCoreDb();
        }
      },
    );
  });
});
