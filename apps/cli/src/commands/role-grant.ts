import { coreDb } from '@seta/core/db';
import { grantRole, revokeRole } from '@seta/identity';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';

const log = pino({ name: 'cli/role-grant' });

export interface RoleGrantOpts {
  user: string;
  tenant: string;
  role: string;
  scope: 'tenant' | 'group';
  group?: string;
  action: 'grant' | 'revoke';
}

async function resolveUserId(emailOrId: string, tenantId: string): Promise<string> {
  if (UUID_RE.test(emailOrId)) return emailOrId;
  const row = await coreDb().execute(sql`
    SELECT id FROM identity."user" WHERE tenant_id = ${tenantId} AND lower(email) = lower(${emailOrId}) LIMIT 1
  `);
  const id = (row.rows[0] as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`No user ${emailOrId} in tenant ${tenantId}`);
  return id;
}

export async function roleGrantCommand(opts: RoleGrantOpts): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  const userId = await resolveUserId(opts.user, tenantId);

  if (opts.action === 'grant') {
    const { grant_id } = await grantRole(
      {
        user_id: userId,
        tenant_id: tenantId,
        role_slug: opts.role,
        scope_type: opts.scope,
        scope_id: opts.scope === 'group' ? (opts.group ?? null) : null,
      },
      { type: 'cli', user_id: null },
    );
    process.stdout.write(`${JSON.stringify({ grant_id, user_id: userId, role: opts.role })}\n`);
  } else {
    const row = await coreDb().execute(sql`
      SELECT id FROM identity.role_grants
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
        AND role_slug = ${opts.role} AND scope_type = ${opts.scope}
        AND COALESCE(scope_id, '-') = COALESCE(${opts.scope === 'group' ? opts.group : null}, '-')
        AND revoked_at IS NULL
      LIMIT 1
    `);
    const grantId = (row.rows[0] as { id?: string } | undefined)?.id;
    if (!grantId) throw new Error(`No active grant matching ${opts.role} for user ${userId}`);
    await revokeRole(grantId, { type: 'cli', user_id: null });
    process.stdout.write(`${JSON.stringify({ revoked_grant_id: grantId })}\n`);
  }

  log.info({ userId, role: opts.role, action: opts.action }, 'role grant updated');
}
