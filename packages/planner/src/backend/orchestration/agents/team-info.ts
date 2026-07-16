import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type {
  AgentResult,
  AgentTool,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import {
  plannerGetGroupOverviewTool,
  plannerGetUserActivityTool,
  plannerGetWorkloadTool,
  plannerListBucketsTool,
  plannerListPlansTool,
  plannerSearchGroupMembersBySkillsTool,
} from '@seta/planner/agent-tools';
import { listPlans } from '../../domain/list-plans.ts';
import { listMemberGroupIds } from '../../read-helpers.ts';
import { pickModel } from '../model.ts';
import {
  type QuerySubAgentInput as In,
  type QuerySubAgentOutput as Out,
  QuerySubAgentInputSchema,
  QuerySubAgentOutputSchema,
} from '../schemas.ts';

export const TEAM_INFO_TOOL_IDS = [
  'planner_getGroupOverview',
  'planner_getWorkload',
  'planner_getUserActivity',
  'planner_listPlans',
  'planner_listBuckets',
  'planner_searchGroupMembersBySkills',
] as const;

export interface QueryTeamInfoDeps {
  resolveModel: () => MastraModelConfig;
  /** Optional tool overrides for eval mocking; default to the real module tools. */
  getGroupOverviewTool?: AgentTool;
  listPlansTool?: AgentTool;
  listBucketsTool?: AgentTool;
  searchGroupMembersBySkillsTool?: AgentTool;
  /** Non-tool DB seams (default to the real functions); overridden for eval. */
  listMemberGroupIds?: typeof listMemberGroupIds;
  buildActorSession?: typeof buildActorSession;
  listPlans?: typeof listPlans;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

function buildInstructions({ requestContext }: { requestContext: RequestContext }): string {
  const groupIds = requestContext.get<'caller_group_ids', string[]>('caller_group_ids') ?? [];
  const planIds = requestContext.get<'caller_plan_ids', string[]>('caller_plan_ids') ?? [];
  const resolved =
    groupIds.length || planIds.length
      ? `\n\nThe caller's own group(s)/plan(s), pre-resolved (internal ids, not for the user):\n` +
        [...groupIds.map((id) => `- group ${id}`), ...planIds.map((id) => `- plan ${id}`)].join(
          '\n',
        ) +
        `\nUse these directly for "my group/team/plan" questions — no need to ask. ` +
        `If several are listed and the question doesn't say which, call planner_getGroupOverview ` +
        `/ planner_listPlans to get their names, then ask the user to pick by name — never by id.\n`
      : '';

  return `You answer questions about org structure and people in prose:
group members + roles, the plans in a group, the buckets in a plan, and who has
which skills.

Tools:
- planner_getGroupOverview(groupId): group name + members/roles/total count + plans in the group.
- planner_listPlans(groupId?): plans in a group (or all accessible).
- planner_listBuckets(planId): buckets in a plan.
- planner_getWorkload(groupId): per-person open-task counts across a group, busiest first.
- planner_getUserActivity(userId, since?, limit?): a person's recent activity across visible boards.
- planner_searchGroupMembersBySkills(groupId, skills): rank members by skill.
${resolved}
Otherwise resolve groupId / planId from the "[Context: ...]" prefix or a prior list result.
If an id is required and cannot be resolved, ask the user instead of guessing.
groupId / planId / userId are internal tool handles only — never print a raw id/UUID
in your answer. Always refer to groups, plans, and people by name; resolve the name
via a tool call first if you don't already have it.
Read-only.`;
}

export function makeQueryTeamInfoAgent(deps: QueryTeamInfoDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.query.teamInfo',
    description: 'Answers group/plan/member structure and skill questions in prose.',
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
            // Pre-resolve caller's own group(s)/plan(s) into rc — getGroupOverview/
            // listBuckets/searchGroupMembersBySkills require an explicit id with no
            // self-resolution (unlike listPlans(groupId?)), so without this the
            // sub-agent has nothing to answer "my group/team/plan" cold and asks
            // the user for an id instead.
            const groupIds = await (deps.listMemberGroupIds ?? listMemberGroupIds)(
              ctx.actorUserId,
              ctx.tenantId,
            );
            const session = await (deps.buildActorSession ?? buildActorSession)({
              user_id: ctx.actorUserId,
            });
            const myPlans = await (deps.listPlans ?? listPlans)({ session });
            rc.set('caller_group_ids', groupIds);
            rc.set(
              'caller_plan_ids',
              myPlans.map((p) => p.id),
            );

            const agent = new Agent({
              id: 'planner.query.teamInfo',
              name: 'Planner Team Info',
              instructions: buildInstructions,
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_getGroupOverview: deps.getGroupOverviewTool ?? plannerGetGroupOverviewTool,
                planner_getWorkload: plannerGetWorkloadTool,
                planner_getUserActivity: plannerGetUserActivityTool,
                planner_listPlans: deps.listPlansTool ?? plannerListPlansTool,
                planner_listBuckets: deps.listBucketsTool ?? plannerListBucketsTool,
                planner_searchGroupMembersBySkills:
                  deps.searchGroupMembersBySkillsTool ?? plannerSearchGroupMembersBySkillsTool,
              } as never,
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
