import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import type { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  buildAgentRequestContext,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  temporalContextBlock,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import {
  plannerGetBoardSnapshotTool,
  plannerGetGroupOverviewTool,
  plannerGetUserActivityTool,
  plannerGetWorkloadTool,
  plannerListBucketsTool,
  plannerListPlansTool,
  plannerSearchGroupMembersBySkillsTool,
} from '@seta/planner/agent-tools';
import { listPlans } from '../../domain/list-plans.ts';
import { listMemberGroups } from '../../read-helpers.ts';
import { pickModel } from '../model.ts';
import {
  type QuerySubAgentInput as In,
  type QuerySubAgentOutput as Out,
  QuerySubAgentInputSchema,
  QuerySubAgentOutputSchema,
} from '../schemas.ts';
import { mapToolActivity, type OnToolActivity } from '../tool-activity.ts';
import { GROUNDING_POLICY } from './grounding.ts';

export const TEAM_INFO_TOOL_IDS = [
  'planner_getGroupOverview',
  'planner_getWorkload',
  'planner_getUserActivity',
  'planner_listPlans',
  'planner_listBuckets',
  'planner_getBoardSnapshot',
  'planner_searchGroupMembersBySkills',
] as const;

export interface QueryTeamInfoDeps {
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Injectable clock for deterministic date anchors (evals pass a frozen instant). */
  now?: () => Date;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
  /** Eval seam — receives this agent's executed tool calls after generate(). */
  onToolActivity?: OnToolActivity;
}

/** The caller's own-group scope, resolved from identity BEFORE the model runs.
 *  Distilling the raw group list into a status is what stops the "many groups"
 *  case from leaking a pickable list the model then fabricates counts against. */
export type CallerGroupContext =
  | { status: 'none' }
  | { status: 'single'; groupId: string; groupName: string }
  | { status: 'ambiguous'; groups: { id: string; name: string }[] };

export function buildCallerGroupContext(
  groups: { id: string; name: string }[],
): CallerGroupContext {
  if (groups.length === 0) return { status: 'none' };
  const [only] = groups;
  if (groups.length === 1 && only)
    return { status: 'single', groupId: only.id, groupName: only.name };
  return { status: 'ambiguous', groups };
}

/** Group-scope instruction. Identity metadata only — every variant explicitly
 *  bans deriving a member count (or any live statistic) from it. */
export function buildGroupInstructions(ctx: CallerGroupContext): string {
  switch (ctx.status) {
    case 'none':
      return `The caller has no resolvable group. Do not invent a group or any
group-level statistic. If the request needs a group, ask the user to name one.`;
    case 'single':
      return `The caller belongs to exactly one group:
- "${ctx.groupName}" (id: ${ctx.groupId})
This identifies the group ONLY — it carries NO member count, workload, or task
totals. Treat it as the target for "my group/team" questions, but you MUST call
the appropriate tool (e.g. planner_getGroupOverview) to obtain any member count
or other live figure.`;
    case 'ambiguous':
      return `The caller belongs to MULTIPLE groups: ${ctx.groups
        .map((g) => `"${g.name}"`)
        .join(', ')}.
These names are identity metadata for offering the user a choice — they carry NO
member counts or statistics. For any "my group/team" question you MUST first ask
the user which of these groups they mean. Do not pick a group yourself, do not
call a group tool before the user has chosen, and never state a member count or
other group statistic.`;
  }
}

/** The clock comes first so the per-turn caller can bind it; `args` carries the
 *  identity metadata Mastra supplies when it resolves dynamic instructions. Both
 *  are optional so a test can render the prompt for a fixed instant alone. */
export function buildInstructions(
  now: Date = new Date(),
  args?: { requestContext?: RequestContext },
): string {
  const requestContext = args?.requestContext;
  const groups =
    requestContext?.get<'caller_groups', { id: string; name: string }[]>('caller_groups') ?? [];
  const plans =
    requestContext?.get<'caller_plans', { id: string; name: string }[]>('caller_plans') ?? [];
  const groupCtx = buildCallerGroupContext(groups);
  const planLine = plans.length
    ? `\n\nThe caller's plans (identity metadata only — no live figures): ${plans
        .map((p) => `"${p.name}"`)
        .join(', ')}. If several are listed and the question doesn't say which, ask by name.`
    : '';

  return `You answer questions about org structure and people in prose:
group members + roles, the plans in a group, the buckets in a plan, a plan's
board overview, who has which skills, and what a person has been doing lately.

${temporalContextBlock(now)}

Tools (all support groupName/planName as alternatives to groupId/planId):
- planner_getGroupOverview(groupId?, groupName?): group name + members/roles/total count + plans.
- planner_listPlans(groupId?): plans in a group (or all accessible).
- planner_listBuckets(planId?, planName?): buckets in a plan.
- planner_getBoardSnapshot(planId?, planName?): a plan's board overview — its
  buckets/columns plus task counts by status (not started / in progress / completed).
  Use this for "show me the board", "board của <plan>", "how's <plan> looking".
- planner_getWorkload(groupId?, groupName?): per-person open-task counts, busiest first.
- planner_getUserActivity(userId?, userName?, since?, limit?): a person's recent activity
  (what they DID — created/updated/completed items), newest first. Use this for
  "what did I do", "hôm nay/tuần này tôi đã làm gì", "what has <person> been up to".
  Identity: omit userId AND userName for the CURRENT user ("me/tôi/I"); pass userName
  (a name/email) for ANOTHER person — this tool resolves the name itself, so do NOT
  invent a UUID. For a time window pass since = the matching date anchor above
  (e.g. "this week" → since = this-week start; "today" → since = today).
- planner_searchGroupMembersBySkills(groupId?, groupName?, skills): rank members by skill.

${buildGroupInstructions(groupCtx)}${planLine}

Otherwise resolve groupId / planId from the "[Context: ...]" prefix or a prior list result.
groupId / planId / userId are internal tool handles only — never print a raw id/UUID
in your answer. Always refer to groups, plans, and people by name.

${GROUNDING_POLICY}
Read-only.`;
}

export function makeQueryTeamInfoAgent(deps: QueryTeamInfoDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.query.teamInfo',
    description: 'Answers group/plan/member structure and skill questions in prose.',
    inputSchema: QuerySubAgentInputSchema,
    outputSchema: QuerySubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = buildAgentRequestContext(ctx);

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            // Pre-resolve caller's own group(s)/plan(s) into rc — getGroupOverview/
            // listBuckets/searchGroupMembersBySkills require an explicit id with no
            // self-resolution (unlike listPlans(groupId?)), so without this the
            // sub-agent has nothing to answer "my group/team/plan" cold and asks
            // the user for an id instead.
            const myGroups = await listMemberGroups(ctx.actorUserId, ctx.tenantId);
            const session = await buildActorSession({ user_id: ctx.actorUserId });
            const myPlans = await listPlans({ session });
            rc.set('caller_groups', myGroups);
            rc.set(
              'caller_plans',
              myPlans.map((p) => ({ id: p.id, name: p.name })),
            );

            const agentId = 'planner.query.teamInfo';
            const rawAgent = new Agent({
              id: agentId,
              name: 'Planner Team Info',
              instructions: ({ requestContext }: { requestContext: RequestContext }) =>
                buildInstructions(deps.now?.(), { requestContext }),
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_getGroupOverview: plannerGetGroupOverviewTool,
                planner_getWorkload: plannerGetWorkloadTool,
                planner_getUserActivity: plannerGetUserActivityTool,
                planner_listPlans: plannerListPlansTool,
                planner_listBuckets: plannerListBucketsTool,
                planner_getBoardSnapshot: plannerGetBoardSnapshotTool,
                planner_searchGroupMembersBySkills: plannerSearchGroupMembersBySkillsTool,
              } as never,
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
                          serviceName: 'query-team-info',
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
