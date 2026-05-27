import { sql } from 'drizzle-orm';
import { coreDb } from '../../db/client.ts';

export interface DlqAlerterLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export async function subscriptionDlqAlerter(log?: DlqAlerterLogger): Promise<void> {
  const db = coreDb();
  const recent = await db.execute(sql`
    SELECT subscription, count(*)::int AS n
    FROM core.subscription_dead_letter
    WHERE dead_lettered_at > now() - interval '5 minutes'
    GROUP BY subscription
  `);
  for (const row of recent.rows ?? []) {
    const subscription = row.subscription as string;
    const count = row.n as number;
    if (log) {
      log.warn({ subsystem: 'core.dispatcher.dlq', subscription, count }, 'dead-letter alert');
    } else {
      console.warn(`[dispatcher] dead-letter alert: subscription=${subscription} count=${count}`);
    }
  }
}
