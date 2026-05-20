import { getPool, initPools } from '@seta/shared-db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.ts';
import { linkSsoAccount } from './domain/link-sso-account.ts';
import { entraSsoConfigured, parseIdentityEnv } from './env.ts';
import { argon2id } from './password/argon2.ts';
import { computeBackoffSeconds, recordFailedAttempt } from './password/backoff.ts';
import { hibpCheck } from './password/hibp.ts';
import { stashSsoContext, takeSsoContext } from './sso/profile-context.ts';
import { resolveSetaTenantFromEmail, validateEntraTid } from './sso/tenant-resolution.ts';

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
    accountLinking: {
      enabled: true,
      trustedProviders: ['microsoft'],
      allowDifferentEmails: false,
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

  socialProviders: entraSsoConfigured(env)
    ? {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET,
          tenantId: 'common',
          prompt: 'select_account',
          disableImplicitSignUp: true,
          mapProfileToUser: async (profile) => {
            const seta = await resolveSetaTenantFromEmail(profile.email ?? '');
            if (!seta) {
              throw new APIError('FORBIDDEN', { message: 'no_tenant_for_email_domain' });
            }
            if (!profile.tid || !validateEntraTid(seta, profile.tid)) {
              throw new APIError('FORBIDDEN', { message: 'tid_mismatch' });
            }
            const oid = profile.oid ?? profile.sub;
            if (!oid) throw new APIError('BAD_REQUEST', { message: 'missing_oid' });
            const email = (profile.email ?? '').toLowerCase();
            const name = profile.name ?? profile.preferred_username ?? email.split('@')[0] ?? email;
            stashSsoContext(oid, {
              seta_tenant_id: seta.tenant_id,
              tid: profile.tid,
              email,
              name,
            });
            return { id: oid, email, name };
          },
        },
      }
    : undefined,

  rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },

  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const password = (data as { password?: string }).password;
          if (password === undefined) {
            throw new APIError('BAD_REQUEST', { message: 'not_pre_provisioned' });
          }
          if (await hibpCheck(password)) {
            throw new APIError('UNPROCESSABLE_ENTITY', {
              message:
                'This password appears in a known data breach. Please choose a different password.',
            });
          }
          return { data };
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          if (account.providerId !== 'microsoft') return { data: account };

          const accountId = (account as { accountId?: string }).accountId;
          if (!accountId) throw new APIError('BAD_REQUEST', { message: 'missing_account_id' });

          const ctx = takeSsoContext(accountId);
          if (!ctx) {
            throw new APIError('FORBIDDEN', { message: 'missing_sso_context' });
          }

          const result = await linkSsoAccount(
            {
              tenant_id: ctx.seta_tenant_id,
              provider_id: 'microsoft-entra-id',
              email: ctx.email,
              name: ctx.name,
              entra_oid: accountId,
              entra_tid: ctx.tid,
            },
            { type: 'sso', user_id: null },
          );

          if (result.outcome === 'rejected_not_pre_provisioned') {
            throw new APIError('BAD_REQUEST', { message: 'not_pre_provisioned' });
          }
          if (result.outcome === 'rejected_deactivated') {
            throw new APIError('FORBIDDEN', { message: 'user_deactivated' });
          }
          if (result.outcome === 'rejected_oid_conflict') {
            throw new APIError('CONFLICT', { message: 'oid_conflict' });
          }

          return { data: account };
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
