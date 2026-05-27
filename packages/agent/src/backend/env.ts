import { z } from 'zod';

const Env = z.object({
  AGENT_MODEL: z.string().min(1).optional(),
  AGENT_MODELS: z.string().optional(),
  AGENT_MODEL_DEFAULT: z.string().optional(),
  AGENT_MODEL_BASE_URL: z.string().url().optional(),
  AGENT_MODEL_API_KEY: z.string().optional(),
  AGENT_HITL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  AGENT_RATE_LIMIT_TPM: z.coerce.number().int().positive().default(60_000),
  AGENT_RATE_LIMIT_TURNS_PER_MIN: z.coerce.number().int().positive().default(10),

  // Tool execution timeout + circuit breaker
  AGENT_TOOL_TIMEOUT_READ_MS: z.coerce.number().int().positive().default(30_000),
  AGENT_TOOL_TIMEOUT_WRITE_MS: z.coerce.number().int().positive().default(60_000),
  AGENT_TOOL_TIMEOUT_MAX_MS: z.coerce.number().int().positive().default(300_000),
  AGENT_TOOL_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  AGENT_TOOL_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(60_000),

  // Memory configuration
  AGENT_MEMORY_LAST_MESSAGES: z.coerce.number().int().positive().default(20),
});

export type AgentEnv = z.infer<typeof Env>;

export function parseAgentEnv(source: Record<string, string | undefined>): AgentEnv {
  return Env.parse(source);
}

export const agentEnv: AgentEnv = parseAgentEnv(process.env);
