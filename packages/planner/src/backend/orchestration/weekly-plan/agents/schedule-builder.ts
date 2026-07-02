import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { pickModel } from '../../model.ts';
import {
  capacityHint,
  fallbackPlan,
  prePassOrder,
  validatePlan,
  windowDays,
} from '../scheduling.ts';
import {
  BuilderInputSchema,
  BuilderOutputSchema,
  type BuilderInput as In,
  type BuilderOutput as Out,
  type WeeklyPlan,
  WeeklyPlanSchema,
} from '../schemas.ts';

export interface WeeklyPlanScheduleBuilderDeps {
  resolveModel: () => MastraModelConfig;
  /** Test-only seam replacing the LLM placement call; validator/repair/fallback run for real. */
  generatePlan?: (args: { message: string; requestContext: RequestContext }) => Promise<WeeklyPlan>;
}

const INSTRUCTIONS = `You build a day-by-day work plan. Hard rules:
- Use ONLY the window days listed in the message; never any other day.
- Place EVERY listed task exactly once, referenced by its exact title. unplaced must be [].
- A task with a due date inside the week must land on or before that weekday.
- Overdue tasks go on the earliest window day.
Soft goals:
- Group related tasks (same theme or topic) into the same named focus block so the
  user avoids context switching; blocks are contiguous within a day by construction.
- Balance the number of tasks per day around the stated per-day target.
Return only the structured plan object.`;

export function makeWeeklyPlanScheduleBuilder(
  deps: WeeklyPlanScheduleBuilderDeps,
): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.weeklyPlan.scheduleBuilder',
    description:
      'Places normalized tasks onto the window days: deterministic pre-pass, LLM grouping/placement, deterministic validation with one repair retry, deterministic fallback.',
    inputSchema: BuilderInputSchema,
    outputSchema: BuilderOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      if (input.tasks.length === 0) {
        return {
          result: { plan: { days: [], unplaced: [] }, caveat: null },
          trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.3 },
        };
      }

      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const ordered = prePassOrder(input.tasks);
      const days = windowDays(input.window);
      const perDay = capacityHint(input.tasks.length, input.window);

      const baseMessage = [
        `Window days (in order): ${days.join(', ')}. weekStart ${input.window.weekStart}, weekEnd ${input.window.weekEnd}.`,
        `Aim for about ${perDay} task(s) per day.`,
        'Tasks in suggested order (overdue first, then due date, then priority):',
        JSON.stringify(
          ordered.map((t) => ({
            title: t.title,
            priority: t.priority,
            dueAt: t.dueAt,
            overdue: t.overdue,
            notes: t.notes ?? null,
          })),
          null,
          2,
        ),
      ].join('\n');

      const callLlm = async (message: string): Promise<WeeklyPlan> => {
        if (deps.generatePlan) return deps.generatePlan({ message, requestContext: rc });
        const agent = new Agent({
          id: 'planner.weeklyPlan.scheduleBuilder',
          name: 'Weekly Plan Schedule Builder',
          instructions: INSTRUCTIONS,
          model: pickModel(ctx, deps.resolveModel),
        });
        const r = await agent.generate(message, {
          structuredOutput: { schema: WeeklyPlanSchema },
          requestContext: rc,
          abortSignal: ctx.abortSignal,
        });
        if (!r.object) throw new Error('schedule building returned no structured output');
        return r.object;
      };

      const first = await callLlm(baseMessage);
      let validation = validatePlan(first, input.tasks, input.window);
      if (validation.ok) {
        return {
          result: { plan: first, caveat: null },
          trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.7 },
        };
      }

      const second = await callLlm(
        `${baseMessage}\n\nYour previous plan had these violations — return a corrected plan:\n- ${validation.violations.join('\n- ')}`,
      );
      validation = validatePlan(second, input.tasks, input.window);
      if (validation.ok) {
        return {
          result: { plan: second, caveat: null },
          trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 },
        };
      }

      return {
        result: {
          plan: fallbackPlan(input.tasks, input.window),
          caveat:
            'The AI placement failed validation twice, so a deterministic order (due date, then priority) was used instead.',
        },
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.4 },
      };
    },
  };
}
