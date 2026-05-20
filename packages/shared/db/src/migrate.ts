import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

export interface ModuleMigration {
  name: string;
  dir: string;
}

export class MigrationChecksumMismatch extends Error {
  readonly module: string;
  readonly filename: string;
  readonly expected: string;
  readonly actual: string;

  constructor(module: string, filename: string, expected: string, actual: string) {
    super(
      `Migration checksum mismatch for ${module}/${filename}: expected ${expected}, found ${actual}. Don't hand-edit committed migrations — add a new numbered file instead.`,
    );
    this.name = 'MigrationChecksumMismatch';
    this.module = module;
    this.filename = filename;
    this.expected = expected;
    this.actual = actual;
  }
}

export async function runMigrations(opts: {
  pool: Pool;
  modules: ModuleMigration[];
  ledgerSchema?: string;
}): Promise<void> {
  const ledgerSchema = opts.ledgerSchema ?? 'core';
  const client = await opts.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [hashLockKey('seta:migrate')]);
    await ensureLedger(client, ledgerSchema);

    for (const mod of opts.modules) {
      const entries = listSqlFiles(mod.dir);
      for (const file of entries) {
        const fullPath = join(mod.dir, file);
        const body = readFileSync(fullPath, 'utf-8');
        const checksum = sha256(body);
        const prior = await client.query<{ checksum: string }>(
          `SELECT checksum FROM ${ledgerSchema}.__seta_migrations WHERE module=$1 AND filename=$2`,
          [mod.name, file],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].checksum !== checksum) {
            throw new MigrationChecksumMismatch(mod.name, file, prior.rows[0].checksum, checksum);
          }
          continue;
        }
        await client.query(body);
        await client.query(
          `INSERT INTO ${ledgerSchema}.__seta_migrations (module, filename, checksum) VALUES ($1, $2, $3)`,
          [mod.name, file, checksum],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function ensureLedger(client: PoolClient, schema: string): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.__seta_migrations (
      module     text NOT NULL,
      filename   text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (module, filename)
    )
  `);
}

function listSqlFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return [];
    throw err;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function hashLockKey(s: string): number {
  const h = createHash('sha256').update(s).digest();
  return h.readInt32BE(0);
}
