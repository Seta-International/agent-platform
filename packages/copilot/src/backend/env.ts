import { z } from 'zod';

const Env = z.object({
  COPILOT_MODEL: z.string().min(1).optional(),
  COPILOT_MODELS: z.string().optional(),
  COPILOT_MODEL_DEFAULT: z.string().optional(),
  COPILOT_MODEL_BASE_URL: z.string().url().optional(),
  COPILOT_MODEL_API_KEY: z.string().optional(),
  COPILOT_HITL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  COPILOT_RATE_LIMIT_TPM: z.coerce.number().int().positive().default(60_000),
  COPILOT_RATE_LIMIT_TURNS_PER_MIN: z.coerce.number().int().positive().default(10),

  // Tool execution timeout + circuit breaker
  // (see docs/superpowers/specs/2026-05-26-tool-execution-timeout-design.md)
  COPILOT_TOOL_TIMEOUT_READ_MS: z.coerce.number().int().positive().default(30_000),
  COPILOT_TOOL_TIMEOUT_WRITE_MS: z.coerce.number().int().positive().default(60_000),
  COPILOT_TOOL_TIMEOUT_MAX_MS: z.coerce.number().int().positive().default(300_000),
  COPILOT_TOOL_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  COPILOT_TOOL_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(60_000),
});

export type CopilotEnv = z.infer<typeof Env>;

export function parseCopilotEnv(source: Record<string, string | undefined>): CopilotEnv {
  return Env.parse(source);
}

export const copilotEnv: CopilotEnv = parseCopilotEnv(process.env);
