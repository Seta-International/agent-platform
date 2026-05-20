import { z } from 'zod';

const Env = z.object({
  COPILOT_MODEL: z.string().min(1),
  COPILOT_MODEL_BASE_URL: z.string().url().optional(),
  COPILOT_MODEL_API_KEY: z.string().optional(),
  COPILOT_HITL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  COPILOT_RATE_LIMIT_TPM: z.coerce.number().int().positive().default(60_000),
  COPILOT_RATE_LIMIT_TURNS_PER_MIN: z.coerce.number().int().positive().default(10),
});

export type CopilotEnv = z.infer<typeof Env>;

export function parseCopilotEnv(source: Record<string, string | undefined>): CopilotEnv {
  return Env.parse(source);
}

export const copilotEnv: CopilotEnv = parseCopilotEnv(process.env);
