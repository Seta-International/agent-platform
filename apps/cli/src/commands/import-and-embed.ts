import { coreDb } from '@seta/core/db';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { runEmbedBackfill } from './embed-backfill.ts';
import { importCsvCommand } from './import-csv.ts';
import { resolveTenantId } from './lib/tenant-resolve.ts';

const log = pino({ name: 'cli/import-and-embed' });

export interface ImportAndEmbedOpts {
  tenant: string;
  dir: string;
  as: string;
}

export async function importAndEmbedCommand(opts: ImportAndEmbedOpts): Promise<void> {
  log.info({ tenant: opts.tenant, dir: opts.dir }, 'step 1/2: import CSV');
  await importCsvCommand({ tenant: opts.tenant, dir: opts.dir, as: opts.as });

  const tenantId = await resolveTenantId(opts.tenant);

  log.info({ tenant: tenantId }, 'step 2/2: embed-backfill (identity)');
  await runEmbedBackfill({ module: 'identity', tenant: tenantId });

  const counts = await coreDb().execute(sql`
    SELECT COUNT(*) AS user_embeddings
      FROM identity.user_profile_embeddings
     WHERE tenant_id = ${tenantId}
  `);
  const row = counts.rows[0] as { user_embeddings: string } | undefined;
  process.stdout.write(
    `${JSON.stringify({
      phase: 'done',
      tenant_id: tenantId,
      user_embeddings: Number(row?.user_embeddings ?? 0),
    })}\n`,
  );
}
