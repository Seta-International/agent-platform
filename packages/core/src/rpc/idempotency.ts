import type { ModuleKey } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { rpcIdempotency } from '../db/schema/rpc-idempotency.ts';

export async function withIdempotency<T>(
  key: string,
  module: ModuleKey,
  method: string,
  body: () => Promise<T>,
): Promise<T> {
  const db = coreDb();
  const existing = await db
    .select({ result: rpcIdempotency.result })
    .from(rpcIdempotency)
    .where(eq(rpcIdempotency.idempotency_key, key))
    .limit(1);
  if (existing[0]?.result != null) {
    return existing[0].result as T;
  }
  const result = await body();
  await db
    .insert(rpcIdempotency)
    .values({
      idempotency_key: key,
      module,
      method,
      result: result as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing();
  const after = await db
    .select({ result: rpcIdempotency.result })
    .from(rpcIdempotency)
    .where(eq(rpcIdempotency.idempotency_key, key))
    .limit(1);
  return (after[0]?.result as T) ?? result;
}
