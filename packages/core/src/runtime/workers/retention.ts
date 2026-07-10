import { executorPool, getLifecycleEntries, runRetention } from '@seta/shared-db';
import type { Pool } from 'pg';

export async function retentionTick(pool?: Pool): Promise<void> {
  await runRetention(pool ?? executorPool(), getLifecycleEntries());
}
