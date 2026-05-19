import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  EVENTS_RETENTION_DAYS: z.coerce.number().default(30),
});

export function parseEnv(raw: NodeJS.ProcessEnv) {
  return Env.parse(raw);
}
