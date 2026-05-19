import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.ts';

function makeLazyDb() {
  let db: ReturnType<typeof drizzle> | null = null;
  return new Proxy({} as ReturnType<typeof drizzle>, {
    get(_target, prop) {
      if (!db) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is not set');
        db = drizzle(new Pool({ connectionString: url }), { schema });
      }
      return (db as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}

export const auth = betterAuth({
  database: drizzleAdapter(makeLazyDb(), { provider: 'pg' }),
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
});
