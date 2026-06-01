import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { UnknownSpecializedAgentError } from './execute-step.ts';

export interface RunAgentDeps {
  getAgent: (id: string) => SpecializedAgentSpec | undefined;
}

/**
 * Invoke a single specialized agent directly (no queue, no run record).
 * Validates input and output against the agent's schemas.
 */
export async function runAgent<O = unknown>(
  agentId: string,
  input: unknown,
  ctx: SpecializedAgentRunCtx,
  deps: RunAgentDeps,
): Promise<AgentResult<O>> {
  const agent = deps.getAgent(agentId);
  if (!agent) throw new UnknownSpecializedAgentError(agentId);
  const parsed = agent.inputSchema.parse(input);
  const res = await agent.run(parsed, ctx);
  agent.outputSchema.parse(res.result);
  return res as AgentResult<O>;
}
