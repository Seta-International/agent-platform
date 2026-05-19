import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';

export async function partitionManagerTick(): Promise<void> {
  const db = coreDb();
  await db.execute(
    sql`SELECT core.ensure_events_partition((date_trunc('month', now()) + interval '1 month')::date)`,
  );
  await db.execute(
    sql`SELECT core.ensure_events_partition((date_trunc('month', now()) + interval '2 months')::date)`,
  );

  const retentionDays = Number(process.env.EVENTS_RETENTION_DAYS ?? 30);
  void retentionDays;
  // Old-partition detach is deferred to a later milestone: the regexp parse of partition
  // bounds is brittle, so we discover but don't drop yet. The seam is here.
  await db.execute(sql`
    SELECT child.relname AS part_name
    FROM pg_inherits
    JOIN pg_class child ON child.oid = pg_inherits.inhrelid
    WHERE inhparent = 'core.events'::regclass
  `);
}
