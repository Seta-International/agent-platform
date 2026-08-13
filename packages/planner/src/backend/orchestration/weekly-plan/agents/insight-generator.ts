import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import {
  type AgentResult,
  buildAgentRequestContext,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import { pickModel } from '../../model.ts';
import { synthesizeWorkloadInsight } from '../scheduling.ts';
import {
  type InsightInput as In,
  type Insight,
  InsightInputSchema,
  InsightOutputSchema,
  type InsightOutput as Out,
} from '../schemas.ts';

export interface WeeklyPlanInsightGeneratorDeps {
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  resolveModel: () => MastraModelConfig;
  /** Test-only seam replacing the LLM call; the deterministic guarantees run for real. */
  generateInsights?: (args: { message: string; requestContext: RequestContext }) => Promise<Out>;
}

const INSTRUCTIONS = `You explain a weekly plan with 1-3 short insights. Kinds:
- "risk": the riskiest item — tight due date on a heavy day, big/ambiguous scope,
  overdue work, or an assumed (missing) deadline or priority worth confirming.
- "workload": why the tasks are distributed across the days the way they are.
- "focus": why tasks were grouped into focus blocks (context-switching cost).
Each insight is one or two sentences of plain language naming concrete tasks.
Return only the structured object.
/no_think`;

export function makeWeeklyPlanInsightGenerator(
  deps: WeeklyPlanInsightGeneratorDeps,
): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.weeklyPlan.insightGenerator',
    description:
      'Produces 1-3 plan insights (risk / workload / focus) with deterministic guarantees: never zero, and overdue work always yields a risk flag.',
    inputSchema: InsightInputSchema,
    outputSchema: InsightOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = buildAgentRequestContext(ctx);

      const message = [
        `Plan: ${JSON.stringify(input.plan)}`,
        `Tasks: ${JSON.stringify(
          input.tasks.map((t) => ({
            title: t.title,
            priority: t.priority,
            priorityAssumed: t.priorityAssumed,
            dueAt: t.dueAt,
            dueAssumed: t.dueAssumed,
            overdue: t.overdue,
          })),
        )}`,
      ].join('\n');

      const out = deps.generateInsights
        ? await deps.generateInsights({ message, requestContext: rc })
        : await (async () => {
            const agent = new Agent({
              id: 'planner.weeklyPlan.insightGenerator',
              name: 'Weekly Plan Insight Generator',
              instructions: withTemporalContext(INSTRUCTIONS, { now: deps.now?.() }),
              model: pickModel(ctx, deps.resolveModel),
            });
            console.log('[weeklyPlan.insightGenerator] in:', message);
            try {
              const stream = await agent.stream(message, {
                structuredOutput: { schema: InsightOutputSchema },
                requestContext: rc,
                abortSignal: ctx.abortSignal,
              });
              const object = await stream.object;
              if (!object) throw new Error('insight generation returned no structured output');
              console.log('[weeklyPlan.insightGenerator] out:', JSON.stringify(object));
              return object;
            } catch (err) {
              console.error('[weeklyPlan.insightGenerator] throw:', err);
              throw err;
            }
          })();

      const insights: Insight[] = (out.insights ?? []).slice(0, 3);
      if (insights.length === 0) insights.push(synthesizeWorkloadInsight(input.plan));

      const overdueTitles = input.tasks.filter((t) => t.overdue).map((t) => t.title);
      if (overdueTitles.length > 0 && !insights.some((i) => i.kind === 'risk')) {
        insights.unshift({
          kind: 'risk',
          text: `Overdue: ${overdueTitles.join(', ')} — scheduled at the start of the window.`,
        });
      }

      return {
        result: { insights: insights.slice(0, 3) },
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 },
      };
    },
  };
}
