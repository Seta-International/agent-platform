import type { Pool } from 'pg';

/**
 * Creates the `seta_app` role the way `infra/postgres/initdb/01-app-role.sql` does.
 *
 * Order matters. Every module baseline wraps its grants in
 * `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app')`, so a migration run against a
 * cluster without the role skips the whole block — silently. Call this before `runMigrations`.
 */
export async function createAppRole(pool: Pool): Promise<void> {
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
      CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
    END IF; END $$;`);
}
