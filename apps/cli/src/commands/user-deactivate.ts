import { coreDb } from '@seta/core/db';
import { deactivateUser } from '@seta/identity';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';

const log = pino({ name: 'cli/user-deactivate' });

export async function userDeactivateCommand(opts: { user: string; tenant: string }): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  let userId = opts.user;
  if (!UUID_RE.test(userId)) {
    const row = await coreDb().execute(sql`
      SELECT id FROM identity."user" WHERE tenant_id = ${tenantId} AND lower(email) = lower(${opts.user}) LIMIT 1
    `);
    const id = (row.rows[0] as { id?: string } | undefined)?.id;
    if (!id) throw new Error(`No user ${opts.user} in tenant ${tenantId}`);
    userId = id;
  }
  await deactivateUser(userId, { type: 'cli', user_id: null });
  process.stdout.write(`${JSON.stringify({ user_id: userId, status: 'deactivated' })}\n`);
  log.info({ userId }, 'user deactivated');
}
