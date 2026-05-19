import { getPool, initPools } from '@seta/shared-db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.ts';
import { parseIdentityEnv } from './env.ts';
import { argon2id } from './password/argon2.ts';

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

const env = parseIdentityEnv();

export const auth = betterAuth({
  baseURL: env.PUBLIC_URL,
  basePath: '/api/identity/v1/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.PUBLIC_URL],

  database: drizzleAdapter(makeLazyDb(), { provider: 'pg' }),

  advanced: {
    cookiePrefix: 'seta',
    useSecureCookies: env.NODE_ENV === 'production',
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
    },
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
    password: {
      hash: argon2id.hash,
      verify: ({ hash, password }) => argon2id.verify(hash, password),
    },
  },

  rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
});

export type Auth = typeof auth;
