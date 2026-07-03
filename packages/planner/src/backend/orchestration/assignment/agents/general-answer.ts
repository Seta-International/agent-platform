import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentSpec } from '@seta/agent-sdk';
import type { z } from 'zod';
import { pickModel } from '../model.ts';
import { GeneralAnswerInputSchema, GeneralAnswerOutputSchema } from '../schemas.ts';

type In = z.infer<typeof GeneralAnswerInputSchema>;
type Out = z.infer<typeof GeneralAnswerOutputSchema>;

export interface GeneralAnswerDeps {
  resolveModel: () => MastraModelConfig;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

const INSTRUCTIONS = [
  "You answer the user's question directly and concisely.",
  'The message may include a `Context:` block holding the text of files the user',
  'attached, delimited by `<<<FILE: name>>> ... <<<END name>>>`. When that block',
  'is present, ground your answer in its content and refer to the file by name',
  'where useful. If the answer is not contained in the attached document(s), say',
  'so plainly instead of inventing facts. With no such block, answer normally.',
].join(' ');

export function makeGeneralAnswerAgent(deps: GeneralAnswerDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'staffing.generalAnswer',
    description: 'Answers a general or document-grounded question in prose (LLM, no tools).',
    inputSchema: GeneralAnswerInputSchema,
    outputSchema: GeneralAnswerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            // Built per run (not at factory time) so the per-turn model override
            // in ctx.model takes effect.
            const agent = new Agent({
              id: 'staffing.generalAnswer',
              name: 'General Answer',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              ...(ctx.userMemory ? { memory: ctx.userMemory.memory } : {}),
            });
            const r = await agent.generate(input.query, {
              requestContext: rc,
              abortSignal: ctx.abortSignal,
              // Read prior turns (the persisted Context text part) so a follow-up
              // about an already-consumed file still answers. readOnly: the chat
              // route owns persistence (userMemory.saveMessages) — never persist
              // here. workingMemory disabled: this agent injects no userContext.
              ...(ctx.userMemory && ctx.threadId
                ? {
                    memory: {
                      thread: ctx.threadId,
                      resource: ctx.actorUserId,
                      options: { readOnly: true, workingMemory: { enabled: false } },
                    },
                  }
                : {}),
            });
            return { text: r.text };
          })();

      const answer = out.text?.trim() ?? '';
      return {
        result: { answer },
        // No tool calls and no sources — a fixed, honest confidence: above the
        // 0.2 failure floor, below the 0.8 the sourced staffing answers carry.
        trust: {
          reasoningTrace: [],
          evidenceCitations: [],
          confidenceScore: answer ? 0.6 : 0.2,
        },
      };
    },
  };
}
