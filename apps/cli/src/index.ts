#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  // CLI is invoked from apps/cli/, but .env lives at repo root.
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
} catch {
  // .env absent — rely on shell-exported vars.
}

import { createCrypto, createKeyProviderFromEnv, parseCryptoEnv } from '@seta/shared-crypto';
import { closePools, initPools } from '@seta/shared-db';
import { Command } from 'commander';
import pino from 'pino';
import { runEmbedBackfill } from './commands/embed-backfill.ts';
import { integrationsMailSetCommand } from './commands/integrations-mail-set.ts';
import { integrationsMailTestCommand } from './commands/integrations-mail-test.ts';
import { migrateCommand } from './commands/migrate.ts';
import { plannerCommand } from './commands/planner.ts';
import { roleGrantCommand } from './commands/role-grant.ts';
import { seedFixtureCommand } from './commands/seed-fixture/index.ts';
import { tenantCreateCommand } from './commands/tenant-create.ts';
import { userCreateCommand } from './commands/user-create.ts';
import { userDeactivateCommand } from './commands/user-deactivate.ts';
import { parseEnv } from './env.ts';

const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const cryptoEnv = parseCryptoEnv(process.env);
const keyProvider = await createKeyProviderFromEnv(cryptoEnv);
const crypto = createCrypto({
  keyProvider,
  log: pino({ name: 'cli/crypto', level: 'silent' }),
});
void crypto;

const program = new Command('seta-cli');

program
  .command('migrate')
  .description('Run module migrations in dep order')
  .action(async () => {
    try {
      await migrateCommand();
    } finally {
      await closePools();
    }
  });

program
  .command('health')
  .description('Liveness probe — verifies env parses and the process can boot. Exits 0/non-0.')
  .action(() => {
    process.stdout.write('ok\n');
    process.exit(0);
  });

program
  .command('tenant-create')
  .description('Create a new tenant with an initial admin user')
  .requiredOption('--name <name>', 'Tenant display name')
  .requiredOption('--slug <slug>', 'URL slug')
  .requiredOption('--admin-email <email>', 'Admin email (bootstrap org.admin)')
  .option('--admin-name <name>', 'Admin display name (defaults to email local-part)')
  .option('--admin-password <password>', 'Admin password (generated if omitted)')
  .option(
    '--idle-timeout-days <n>',
    'Default idle-session timeout (1-90)',
    (v) => parseInt(v, 10),
    30,
  )
  .action(
    async (opts: {
      name: string;
      slug: string;
      adminEmail: string;
      adminName?: string;
      adminPassword?: string;
      idleTimeoutDays?: number;
    }) => {
      try {
        await tenantCreateCommand({
          name: opts.name,
          slug: opts.slug,
          adminEmail: opts.adminEmail,
          adminName: opts.adminName,
          adminPassword: opts.adminPassword,
          idleTimeoutDays: opts.idleTimeoutDays,
        });
      } finally {
        await closePools();
      }
    },
  );

program
  .command('user-create')
  .description('Create a user in a tenant')
  .requiredOption('--tenant <slug-or-id>', 'Tenant slug or UUID')
  .requiredOption('--email <email>', 'User email')
  .requiredOption('--name <name>', 'Display name')
  .option('--password <password>', 'Password (generated if omitted)')
  .option('--role <role-slug>', 'Role to grant (repeatable)', (v: string, prev: string[] = []) => [
    ...prev,
    v,
  ])
  .option('--group <group-id>', 'Group id for group-scoped planner roles')
  .action(
    async (opts: {
      tenant: string;
      email: string;
      name: string;
      password?: string;
      role?: string[];
      group?: string;
    }) => {
      try {
        await userCreateCommand({
          tenant: opts.tenant,
          email: opts.email,
          name: opts.name,
          password: opts.password,
          roles: opts.role,
          group: opts.group,
        });
      } finally {
        await closePools();
      }
    },
  );

program
  .command('role-grant')
  .description('Grant or revoke a role')
  .requiredOption('--user <email-or-id>', 'User email or UUID')
  .requiredOption('--tenant <slug-or-id>', 'Tenant')
  .requiredOption('--role <role-slug>', 'Role slug (e.g. planner.viewer)')
  .option('--scope <scope>', 'Grant scope: tenant or group', 'tenant')
  .option('--group <group-id>', 'Group id (required when scope=group)')
  .requiredOption('--action <action>', 'grant or revoke')
  .action(
    async (opts: {
      user: string;
      tenant: string;
      role: string;
      scope: 'tenant' | 'group';
      group?: string;
      action: 'grant' | 'revoke';
    }) => {
      try {
        await roleGrantCommand({
          user: opts.user,
          tenant: opts.tenant,
          role: opts.role,
          scope: opts.scope,
          group: opts.group,
          action: opts.action,
        });
      } finally {
        await closePools();
      }
    },
  );

program
  .command('user-deactivate')
  .description('Deactivate a user')
  .requiredOption('--user <email-or-id>', 'User email or UUID')
  .requiredOption('--tenant <slug-or-id>', 'Tenant')
  .action(async (opts: { user: string; tenant: string }) => {
    try {
      await userDeactivateCommand({ user: opts.user, tenant: opts.tenant });
    } finally {
      await closePools();
    }
  });

program
  .command('integrations-mail-set')
  .description('Configure outbound mail transport for a tenant')
  .requiredOption('--tenant <slug-or-id>')
  .requiredOption('--kind <kind>', "'graph' or 'smtp'")
  .requiredOption('--sender <email>')
  .option('--sender-display-name <name>')
  .option('--smtp-host <host>')
  .option('--smtp-port <port>', '465 or 587', (v) => Number.parseInt(v, 10))
  .option('--smtp-user <user>')
  .option('--smtp-password <pw>')
  .option('--no-smtp-require-tls', 'disable STARTTLS (default require)')
  .option('--policy-acked', 'attest Application Access Policy is configured (graph)')
  .action(
    async (opts: {
      tenant: string;
      kind: string;
      sender: string;
      senderDisplayName?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPassword?: string;
      smtpRequireTls?: boolean;
      policyAcked?: boolean;
    }) => {
      try {
        if (opts.kind !== 'graph' && opts.kind !== 'smtp') {
          throw new Error('--kind must be graph or smtp');
        }
        await integrationsMailSetCommand({
          tenant: opts.tenant,
          kind: opts.kind,
          sender: opts.sender,
          senderDisplayName: opts.senderDisplayName,
          smtpHost: opts.smtpHost,
          smtpPort: opts.smtpPort,
          smtpUser: opts.smtpUser,
          smtpPassword: opts.smtpPassword,
          smtpRequireTls: opts.smtpRequireTls,
          policyAcked: opts.policyAcked,
        });
      } finally {
        await closePools();
      }
    },
  );

program
  .command('integrations-mail-test')
  .description('Send a test email through the resolved transport')
  .requiredOption('--tenant <slug-or-id>')
  .requiredOption('--to <email>')
  .action(async (opts: { tenant: string; to: string }) => {
    try {
      await integrationsMailTestCommand(opts);
    } finally {
      await closePools();
    }
  });

program
  .command('seed')
  .description(
    'Seed the cross-module dev fixture (tenant + admin, people, PM, planner, hiring) from the fixtures/seta workbook. Auto-creates the tenant + admin; degrades to tenant + admin only when the gitignored workbook is absent. Idempotent.',
  )
  .requiredOption('--tenant <slug>', 'tenant slug', 'seta-international')
  .option('--dir <dir>', 'fixtures dir', 'fixtures/seta')
  .option('--admin-email <email>', 'admin email', 'admin@seta-international.vn')
  .option('--password <pw>', 'default password for seeded logins', 'ChangeMe@2026')
  .action(async (o: { tenant: string; dir: string; adminEmail: string; password?: string }) => {
    try {
      const base = process.env.INIT_CWD ?? process.cwd();
      const { resolve } = await import('node:path');
      await seedFixtureCommand({
        tenant: o.tenant,
        dir: resolve(base, o.dir),
        adminEmail: o.adminEmail,
        password: o.password,
      });
    } finally {
      await closePools();
    }
  });

plannerCommand(program);

program
  .command('embed-backfill')
  .description('Backfill embeddings for a tenant')
  .requiredOption('--module <module>', 'module to backfill (currently: planner)')
  .requiredOption('--tenant <tenant>', 'tenant uuid')
  .action(async (opts: { module: string; tenant: string }) => {
    try {
      await runEmbedBackfill({ module: opts.module, tenant: opts.tenant });
    } finally {
      await closePools();
    }
  });

await program.parseAsync(process.argv);
