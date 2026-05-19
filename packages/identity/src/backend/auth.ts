import { getPool, initPools } from '@seta/shared-db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.ts';
import { parseIdentityEnv } from './env.ts';
import { argon2id } from './password/argon2.ts';
import { computeBackoffSeconds, recordFailedAttempt } from './password/backoff.ts';
import { hibpCheck } from './password/hibp.ts';

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

  user: {
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  account: {
    fields: {
      userId: 'user_id',
      providerId: 'provider_id',
      accountId: 'account_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      idToken: 'id_token',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  verification: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

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

  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const password = (data as { password?: string }).password;
          if (password && (await hibpCheck(password))) {
            throw new APIError('UNPROCESSABLE_ENTITY', {
              message:
                'This password appears in a known data breach. Please choose a different password.',
            });
          }
          return { data };
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email') {
        const email = (ctx.body as { email?: string }).email ?? '';
        const ip =
          (ctx.request?.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
        const wait = await computeBackoffSeconds(email, ip);
        if (wait > 0) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: `Too many failed login attempts. Try again in ${wait}s.`,
            retryAfter: wait,
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email' && isAPIError(ctx.context.returned)) {
        const email = (ctx.body as { email?: string }).email ?? '';
        const ip =
          (ctx.request?.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
        await recordFailedAttempt(email, ip, 'bad_password');
      }
    }),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
});

export type Auth = typeof auth;
