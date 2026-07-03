import { sql } from 'drizzle-orm';
import { coreDb } from '../../db/client.ts';

export async function partitionManagerTick(): Promise<void> {
  const db = coreDb();
  await db.execute(
    sql`SELECT core.ensure_events_partition((date_trunc('month', now()) + interval '1 month')::date)`,
  );
  await db.execute(
    sql`SELECT core.ensure_events_partition((date_trunc('month', now()) + interval '2 months')::date)`,
  );

  // Dropping past-retention partitions is retention_tick's job (core.events is
  // registered with a partition-drop lifecycle policy in register.ts).
}
