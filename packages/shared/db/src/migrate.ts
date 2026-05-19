import type { Pool } from 'pg';

export interface ModuleMigration {
  name: string;
  dir: string;
}

export class MigrationChecksumMismatch extends Error {
  constructor(
    public module: string,
    public filename: string,
    public expected: string,
    public actual: string,
  ) {
    super(
      `Migration checksum mismatch for ${module}/${filename}: expected ${expected}, found ${actual}. Don't hand-edit committed migrations — add a new numbered file instead.`,
    );
  }
}

export async function runMigrations(_opts: {
  pool: Pool;
  modules: ModuleMigration[];
  ledgerSchema?: string;
}): Promise<void> {
  throw new Error('runMigrations: implementation deferred to Phase 4.2');
}
