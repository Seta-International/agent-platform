import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentSpec } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { AvailabilityPort } from '../ports.ts';
import {
  AvaiCheckerInputSchema,
  AvaiCheckerOutputSchema,
  type AvailabilityResult,
} from '../schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from '../trust.ts';
import { makeAvaiCheckerTools } from './avai-checker.tools.ts';

type Out = z.infer<typeof AvaiCheckerOutputSchema>;
type In = z.infer<typeof AvaiCheckerInputSchema>;

export interface AvaiCheckerDeps {
  availability: AvailabilityPort;
  resolveModel: () => LanguageModel;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<MastraToolSignals>;
}

const INSTRUCTIONS = [
  'You assess how available each candidate user is for a task.',
  'ALWAYS call checkAvailability and checkInprogressTasks once each, with all candidate user ids.',
  'Then merge the two result sets by userId and call determineAvaiScore once, passing one item per',
  'user (userId, userName, availability, taskInProgressCount). Return its result.',
].join(' ');

export function makeAvaiCheckerAgent(deps: AvaiCheckerDeps): SpecializedAgentSpec<In, Out> {
  const tools = makeAvaiCheckerTools({ availability: deps.availability });
  const agent = new Agent({
    id: 'staffing.avaiChecker',
    name: 'Availability Checker',
    instructions: INSTRUCTIONS,
    model: deps.resolveModel() as never,
    tools: tools as never,
  });

  return {
    id: 'staffing.avaiChecker',
    description:
      'Scores candidate availability (status + in-progress workload) for a task (LLM-driven).',
    inputSchema: AvaiCheckerInputSchema,
    outputSchema: AvaiCheckerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);

      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const r = await agent.generate(
              `taskId=${input.taskId}. Candidate user ids: ${input.candidates.map((c) => c.userId).join(', ')}.`,
              { requestContext: rc, maxSteps: 6, abortSignal: ctx.abortSignal },
            );
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
            };
          })();

      const fromTool =
        (
          res.toolResults.find((t) => t.payload.toolName === 'determineAvaiScore')?.payload
            .result as { availability?: AvailabilityResult[] } | undefined
        )?.availability ?? [];

      const confidence =
        fromTool.length === 0
          ? 0
          : fromTool.reduce((s, a) => s + a.availabilityScore, 0) / fromTool.length;
      const trust = trustFromMastraResult(res, {
        citations: (tr) =>
          tr.payload.toolName === 'determineAvaiScore'
            ? (
                (tr.payload.result as { availability?: { userId: string }[] }).availability ?? []
              ).map((a) => ({ kind: 'user' as const, id: a.userId }))
            : [],
        confidence,
      });
      return { result: { taskId: input.taskId, availability: fromTool }, trust };
    },
  };
}
