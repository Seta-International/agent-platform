import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { pickModel } from '../model.ts';
import {
  type QuerySubAgentInput as In,
  type QuerySubAgentOutput as Out,
  QuerySubAgentInputSchema,
  QuerySubAgentOutputSchema,
} from '../schemas.ts';

export interface QueryGeneralAnswerDeps {
  resolveModel: () => MastraModelConfig;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

const INSTRUCTIONS = `You answer planner questions in clear prose. You have no tools.
Use ONLY the facts already present in the conversation (including any sub-answers
passed to you) plus the user's question. If a question needs data you were not
given, say what is missing rather than inventing it. Be concise. Never claim to
have taken an action — this is a read-only question-answering flow.`;

export function makeQueryGeneralAnswerAgent(
  deps: QueryGeneralAnswerDeps,
): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.query.generalAnswer',
    description: 'Synthesizes compound/summary/off-topic planner answers in prose (LLM, no tools).',
    inputSchema: QuerySubAgentInputSchema,
    outputSchema: QuerySubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agent = new Agent({
              id: 'planner.query.generalAnswer',
              name: 'Planner General Answer',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
            });
            const r = await agent.generate(input.query, {
              requestContext: rc,
              abortSignal: ctx.abortSignal,
            });
            return { text: r.text };
          })();

      const answer = out.text?.trim() ?? '';
      return {
        result: { answer },
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: answer ? 0.6 : 0.2 },
      };
    },
  };
}
