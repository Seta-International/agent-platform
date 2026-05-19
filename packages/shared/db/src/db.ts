import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export function createDb<S extends Record<string, unknown>>(
  pool: Pool,
  schema: S,
  opts: { schemaFilter: readonly [string] },
): NodePgDatabase<S> {
  // schemaFilter is currently informational: drizzle-kit applies it at generate-time, but the
  // runtime client doesn't enforce it. Carrying it on the API self-documents each module's
  // boundary and leaves room for a future query interceptor without changing the signature.
  void opts;
  return drizzle(pool, { schema });
}
