import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  EVENTS_RETENTION_DAYS: z.coerce.number().default(30),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32),
  COPILOT_MODEL: z.string().optional(),
  COPILOT_MODEL_BASE_URL: z.string().url().optional(),
});

export function parseEnv(raw: NodeJS.ProcessEnv) {
  return Env.parse(raw);
}
export type ServerEnv = z.infer<typeof Env>;
