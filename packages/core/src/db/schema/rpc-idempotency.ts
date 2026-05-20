import { sql } from 'drizzle-orm';
import { jsonb, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const rpcIdempotency = core.table(
  'rpc_idempotency',
  {
    idempotency_key: text('idempotency_key').primaryKey(),
    module: text('module').notNull(),
    method: text('method').notNull(),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex('rpc_idempotency_key_idx').on(t.idempotency_key)],
);
