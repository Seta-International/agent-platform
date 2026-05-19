import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';

export async function isIdleExpired(sessionId: string, tenantId: string): Promise<boolean> {
  const row = await coreDb().execute(sql`
    SELECT s.updated_at AS last_used_at, t.idle_timeout_days
    FROM identity.session s
    JOIN core.tenants t ON t.id = ${tenantId}
    WHERE s.id = ${sessionId}
    LIMIT 1
  `);
  const r = row.rows[0] as { last_used_at: Date; idle_timeout_days: number } | undefined;
  if (!r) return true;
  const age_ms = Date.now() - new Date(r.last_used_at).getTime();
  return age_ms > r.idle_timeout_days * 24 * 60 * 60 * 1000;
}
