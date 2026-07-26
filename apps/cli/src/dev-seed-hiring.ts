/**
 * Dev-only: seed hiring demo data (requisitions + candidates + related) into an
 * existing local tenant, so the requisition/candidate screens have something to show.
 *
 * Unlike `seta-cli seed --demo`, this does NOT need the gitignored PII workbook — it
 * targets the tenant that already exists locally (admin@example.com), seeds a small
 * account list + the real skill catalog, then runs the same `seedHiring` phase.
 *
 *   pnpm -F @seta/cli exec tsx src/dev-seed-hiring.ts
 */
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreDb } from '@seta/core/db';
import { closePools, initPools } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { buildAdminSession } from './commands/seed.ts';
import { seedHiring } from './commands/seed-fixture/phase-hiring.ts';
import { seedSkillCatalog } from './commands/seed-fixture/phase-skills.ts';
import { parseEnv } from './env.ts';

const log = pino({ name: 'cli/dev-seed-hiring' });

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ACCOUNTS = [
  'Acme Corporation',
  'Globex Media',
  'Nordic Retail Group',
  'SkyHealth Systems',
  'Vantage Bank',
];

async function resolveTenantByAdmin(email: string): Promise<string> {
  const r = await coreDb().execute(
    sql`SELECT tenant_id FROM identity."user" WHERE email = ${email} LIMIT 1`,
  );
  const id = (r.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  if (!id) throw new Error(`No user ${email} — bootstrap the tenant first (tenant-bootstrap.sh)`);
  return id;
}

/** account_projection is a read-model; seta is superuser locally so RLS is bypassed. */
async function seedAccounts(tenantId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const name of ACCOUNTS) {
    const existing = await coreDb().execute(
      sql`SELECT account_id FROM hiring.account_projection WHERE tenant_id = ${tenantId} AND name = ${name} LIMIT 1`,
    );
    let id = (existing.rows[0] as { account_id?: string } | undefined)?.account_id;
    if (!id) {
      id = randomUUID();
      await coreDb().execute(
        sql`INSERT INTO hiring.account_projection (account_id, tenant_id, name) VALUES (${id}, ${tenantId}, ${name})`,
      );
    }
    byName.set(name, id);
  }
  log.info({ accounts: byName.size }, 'accounts ready');
  return byName;
}

async function main(): Promise<void> {
  const tenantId = await resolveTenantByAdmin(ADMIN_EMAIL);
  const session = await buildAdminSession(tenantId, ADMIN_EMAIL);
  log.info({ tenantId, admin: ADMIN_EMAIL }, 'seeding hiring demo into existing tenant');

  const accountByName = await seedAccounts(tenantId);
  const catalog = await seedSkillCatalog(session);
  log.info({ skills: catalog.size }, 'skill catalog ready');

  await seedHiring(session, accountByName, catalog);
  log.info('hiring demo seed complete');
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error({ err }, 'seed failed');
    await closePools();
    process.exit(1);
  });
