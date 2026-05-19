import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';

export async function subscriptionDlqAlerter(): Promise<void> {
  const db = coreDb();
  const recent = await db.execute(sql`
    SELECT subscription, count(*)::int AS n
    FROM core.subscription_dead_letter
    WHERE dead_lettered_at > now() - interval '5 minutes'
    GROUP BY subscription
  `);
  for (const row of recent.rows ?? []) {
    console.warn(
      `[dispatcher] dead-letter alert: subscription=${row.subscription as string} count=${
        row.n as number
      }`,
    );
  }
}
