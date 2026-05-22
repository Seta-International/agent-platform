import { type MigrationLagRow, runMigrations as runShared } from '@seta/shared-db';
import type { Pool } from 'pg';
import type { ContributionRegistry } from '../composition/registry.ts';

export type { MigrationLagRow };

export interface RunMigrationsOpts {
  pool: Pool;
  /**
   * When true, diff the migration ledger against expected files and return the lag
   * rows without applying. apps/server and apps/worker use this on boot to fail fast
   * when schema_migrations is behind; apps/cli leaves it unset to actually apply.
   */
  assertCaughtUpOnly?: boolean;
}

export async function runMigrations(
  reg: ContributionRegistry,
  opts: RunMigrationsOpts,
): Promise<MigrationLagRow[]> {
  return runShared({
    pool: opts.pool,
    modules: reg.collected.migrationDirs.map((d) => ({ name: d.module, dir: d.dir })),
    assertCaughtUpOnly: opts.assertCaughtUpOnly ?? false,
  });
}
