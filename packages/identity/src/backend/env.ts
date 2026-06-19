import { z } from 'zod';

const envSchema = z.object({
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  // `lax` is required for OAuth/SSO: the IdP (Entra) redirect back to the
  // callback is cross-site, and `strict` would drop the state cookie → state_mismatch.
  // `lax` still blocks cross-site POST/subresource sends, so CSRF protection holds.
  SESSION_COOKIE_SAMESITE: z.enum(['strict', 'lax']).default('lax'),
});

export type IdentityEnv = z.infer<typeof envSchema>;

export type EntraSsoConfiguredEnv = IdentityEnv & {
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
};

export function parseIdentityEnv(env: NodeJS.ProcessEnv = process.env): IdentityEnv {
  return envSchema.parse(env);
}

export function entraSsoConfigured(
  env: IdentityEnv = parseIdentityEnv(),
): env is EntraSsoConfiguredEnv {
  return Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
}
