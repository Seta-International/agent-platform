import { emit, withEmit } from '@seta/core/events';
import { and, eq, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { tenantSsoProviders } from '../../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { toEmitActor, toEventActor } from '../sso/helpers.ts';
import type { Actor } from './create-user.ts';

export async function setLocalPasswordDisabled(
  args: { tenant_id: string; disabled: boolean },
  actor: Actor,
): Promise<void> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'core.tenant.write', args.tenant_id);
  }

  if (args.disabled) {
    const [hasEnabledProvider] = await identityDb()
      .select({ x: sql<number>`1` })
      .from(tenantSsoProviders)
      .where(
        and(eq(tenantSsoProviders.tenant_id, args.tenant_id), eq(tenantSsoProviders.enabled, true)),
      )
      .limit(1);
    if (!hasEnabledProvider) {
      throw new IdentityError(
        'NO_SSO_PROVIDER',
        'Cannot disable local password without an enabled SSO provider',
      );
    }
  }

  await withEmit({ actor: toEmitActor(actor, args.tenant_id) }, async () => {
    // Raw SQL to update core.tenants — identity's domain function reaches across schemas
    // by SQL, not by importing core's Drizzle client (preserves modular-monolith boundary).
    await identityDb().execute(sql`
      UPDATE core.tenants
      SET local_password_disabled = ${args.disabled}
      WHERE id = ${args.tenant_id}
    `);

    await emit({
      tenantId: args.tenant_id,
      aggregateType: 'core.tenant',
      aggregateId: args.tenant_id,
      eventType: 'core.tenant.local_password_disabled.changed',
      eventVersion: 1,
      payload: {
        actor: toEventActor(actor),
        tenant_id: args.tenant_id,
        disabled: args.disabled,
      },
    });
  });
}
