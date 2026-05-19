import { getPool, initPools } from '@seta/shared-db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.ts';

function makeLazyDb(): NodePgDatabase<typeof schema> {
  let db: NodePgDatabase<typeof schema> | null = null;
  return new Proxy({} as NodePgDatabase<typeof schema>, {
    get(_target, prop) {
      if (!db) {
        const url = process.env.DATABASE_URL;
        try {
          db = drizzle(getPool('web'), { schema });
        } catch {
          if (!url) throw new Error('DATABASE_URL is not set');
          initPools({ databaseUrl: url });
          db = drizzle(getPool('web'), { schema });
        }
      }
      return (db as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}

export const auth = betterAuth({
  database: drizzleAdapter(makeLazyDb(), { provider: 'pg' }),
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});
