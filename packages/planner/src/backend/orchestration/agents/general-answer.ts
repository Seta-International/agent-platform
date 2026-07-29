import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import { pickModel } from '../model.ts';
import {
  type QuerySubAgentInput as In,
  type QuerySubAgentOutput as Out,
  QuerySubAgentInputSchema,
  QuerySubAgentOutputSchema,
} from '../schemas.ts';
import { mapToolActivity, type OnToolActivity } from '../tool-activity.ts';
import { GROUNDING_POLICY } from './grounding.ts';

export interface QueryGeneralAnswerDeps {
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
  /** Eval seam — receives this agent's executed tool calls after generate(). */
  onToolActivity?: OnToolActivity;
}

const INSTRUCTIONS = `You answer planner questions in clear prose. You have no tools.
Use ONLY the facts already present in the conversation (including any sub-answers
passed to you) plus the user's question. If a question needs data you were not
given, say what is missing rather than inventing it. Be concise. Never claim to
have taken an action — this is a read-only question-answering flow.

${GROUNDING_POLICY}`;

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
            const agentId = 'planner.query.generalAnswer';
            const rawAgent = new Agent({
              id: agentId,
              name: 'Planner General Answer',
              instructions: withTemporalContext(INSTRUCTIONS, { now: deps.now?.() }),
              model: pickModel(ctx, deps.resolveModel),
            });
            const hasStorage = typeof deps.mastraStorage?.getStore === 'function';
            const mastra = new Mastra({
              agents: { [agentId]: rawAgent },
              ...(hasStorage ? { storage: deps.mastraStorage } : {}),
              logger: new ConsoleLogger({
                name: 'Mastra',
                level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
              }),
              ...(hasStorage
                ? {
                    observability: new Observability({
                      configs: {
                        default: {
                          serviceName: 'query-general-answer',
                          exporters: [new MastraStorageExporter()],
                        },
                      },
                    }),
                  }
                : {}),
            });
            const agent = mastra.getAgent(agentId);
            const r = await agent.generate(input.query, {
              requestContext: rc,
              abortSignal: ctx.abortSignal,
            });
            deps.onToolActivity?.(mapToolActivity(r.toolCalls, r.toolResults));
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
