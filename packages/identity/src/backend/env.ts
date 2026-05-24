import { z } from 'zod';

const envSchema = z.object({
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  SESSION_COOKIE_SAMESITE: z.enum(['strict', 'lax']).default('strict'),
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
