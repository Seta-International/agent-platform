import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { getPool } from '@seta/shared-db';
import pino from 'pino';

const log = pino({ name: 'cli/migrate' });

export async function migrateCommand(): Promise<void> {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerIdentityContributions(reg);
  await runMigrations(reg, { pool: getPool('worker') });
  log.info('migrations applied');
}
