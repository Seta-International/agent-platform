import { z } from 'zod';

const envSchema = z.object({
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type IdentityEnv = z.infer<typeof envSchema>;

export function parseIdentityEnv(env: NodeJS.ProcessEnv = process.env): IdentityEnv {
  return envSchema.parse(env);
}
