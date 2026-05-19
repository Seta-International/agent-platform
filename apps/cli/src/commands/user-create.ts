import { createUser, grantRole } from '@seta/identity';
import pino from 'pino';
import { generatePassword } from './lib/password-gen.ts';
import { resolveTenantId } from './lib/tenant-resolve.ts';

const log = pino({ name: 'cli/user-create' });

export interface UserCreateOpts {
  tenant: string;
  email: string;
  name: string;
  password?: string;
  roles?: string[];
  group?: string;
}

export async function userCreateCommand(opts: UserCreateOpts): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  const generatedPassword = opts.password ?? generatePassword();

  const { user_id } = await createUser(
    { tenant_id: tenantId, email: opts.email, name: opts.name, password: generatedPassword },
    { type: 'cli', user_id: null },
  );

  for (const slug of opts.roles ?? []) {
    const isGroupScoped = slug.startsWith('planner.') && Boolean(opts.group);
    await grantRole(
      {
        user_id,
        tenant_id: tenantId,
        role_slug: slug,
        scope_type: isGroupScoped ? 'group' : 'tenant',
        scope_id: isGroupScoped ? (opts.group ?? null) : null,
      },
      { type: 'cli', user_id: null },
    );
  }

  const out: Record<string, unknown> = {
    user_id,
    email: opts.email.toLowerCase(),
    tenant_id: tenantId,
  };
  if (!opts.password) out.password = generatedPassword;
  process.stdout.write(`${JSON.stringify(out)}\n`);
  log.info({ user_id, email: opts.email }, 'user created');
}
