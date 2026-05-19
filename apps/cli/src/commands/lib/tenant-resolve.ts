import { coreDb } from '@seta/core/db';
import { sql } from 'drizzle-orm';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveTenantId(input: string): Promise<string> {
  if (UUID_RE.test(input)) return input;
  const row = await coreDb().execute(
    sql`SELECT id FROM core.tenants WHERE slug = ${input} LIMIT 1`,
  );
  const id = (row.rows[0] as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`No tenant with slug or id: ${input}`);
  return id;
}
