import { runMigrations as runShared } from '@seta/shared-db';
import type { Pool } from 'pg';
import type { ContributionRegistry } from './registry.ts';

export async function runMigrations(
  reg: ContributionRegistry,
  opts: { pool: Pool },
): Promise<void> {
  await runShared({
    pool: opts.pool,
    modules: reg.collected.migrationDirs.map((d) => ({ name: d.module, dir: d.dir })),
  });
}
