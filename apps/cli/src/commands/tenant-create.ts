import { coreTenants } from '@seta/core/db/schema';
import { emit, withEmit } from '@seta/core/events';
import { createUser } from '@seta/identity';
import pino from 'pino';
import { generatePassword } from './lib/password-gen.ts';

const log = pino({ name: 'cli/tenant-create' });

export interface TenantCreateOpts {
  name: string;
  slug: string;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
  idleTimeoutDays?: number;
}

export async function tenantCreateCommand(opts: TenantCreateOpts): Promise<void> {
  const tenantId = crypto.randomUUID();

  await withEmit({ actor: { userId: 'cli', tenantId } }, async (tx) => {
    await tx.insert(coreTenants).values({
      id: tenantId,
      name: opts.name,
      slug: opts.slug,
      idle_timeout_days: opts.idleTimeoutDays ?? 30,
    });
    await emit({
      tenantId,
      aggregateType: 'core.tenant',
      aggregateId: tenantId,
      eventType: 'core.tenant.created',
      eventVersion: 1,
      payload: { tenantId, name: opts.name, slug: opts.slug },
    });
  });

  if (opts.adminEmail) {
    const generatedPassword = opts.adminPassword ?? generatePassword();
    const adminName = opts.adminName ?? opts.adminEmail.split('@')[0] ?? opts.adminEmail;

    const { user_id: adminUserId } = await createUser(
      {
        tenant_id: tenantId,
        email: opts.adminEmail,
        name: adminName,
        password: generatedPassword,
        initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
      },
      { type: 'cli', user_id: null },
    );

    const output: Record<string, unknown> = {
      tenant_id: tenantId,
      admin_user_id: adminUserId,
      admin_email: opts.adminEmail.toLowerCase(),
    };
    if (!opts.adminPassword) output.admin_password = generatedPassword;
    process.stdout.write(`${JSON.stringify(output)}\n`);
    log.info({ tenantId, adminUserId, slug: opts.slug }, 'tenant created');
  } else {
    process.stdout.write(`${JSON.stringify({ tenant_id: tenantId })}\n`);
    log.info({ tenantId, slug: opts.slug }, 'tenant created');
  }
}
