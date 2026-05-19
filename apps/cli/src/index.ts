#!/usr/bin/env node
import { closePools, initPools } from '@seta/shared-db';
import { Command } from 'commander';
import { migrateCommand } from './commands/migrate.ts';
import { seedCommand } from './commands/seed.ts';
import { tenantCreateCommand } from './commands/tenant-create.ts';
import { parseEnv } from './env.ts';

const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

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
  .command('seed')
  .description('Seed demo data')
  .action(async () => {
    try {
      await seedCommand();
    } finally {
      await closePools();
    }
  });

program
  .command('tenant-create')
  .description('Create a new tenant')
  .requiredOption('--name <name>', 'Tenant display name')
  .requiredOption('--slug <slug>', 'URL slug')
  .action(async (opts: { name: string; slug: string }) => {
    try {
      await tenantCreateCommand(opts);
    } finally {
      await closePools();
    }
  });

await program.parseAsync(process.argv);
