import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import {
  plannerListBucketsTool,
  plannerListGroupMembersTool,
  plannerListPlansTool,
  plannerSearchGroupMembersBySkillsTool,
} from '@seta/planner/agent-tools';
import { pickModel } from '../model.ts';
import {
  type QnaSubAgentInput as In,
  type QnaSubAgentOutput as Out,
  QnaSubAgentInputSchema,
  QnaSubAgentOutputSchema,
} from '../schemas.ts';

export const TEAM_INFO_TOOL_IDS = [
  'planner_listGroupMembers',
  'planner_listPlans',
  'planner_listBuckets',
  'planner_searchGroupMembersBySkills',
] as const;

export interface QnaTeamInfoDeps {
  resolveModel: () => MastraModelConfig;
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<{ text: string }>;
}

const INSTRUCTIONS = `You answer questions about org structure and people in prose:
group members + roles, the plans in a group, the buckets in a plan, and who has
which skills.

Tools:
- planner_listGroupMembers(groupId): members + roles + total count.
- planner_listPlans(groupId?): plans in a group (or all accessible).
- planner_listBuckets(planId): buckets in a plan.
- planner_searchGroupMembersBySkills(groupId, skills): rank members by skill.

Resolve groupId / planId from the "[Context: ...]" prefix or a prior list result.
If an id is required and cannot be resolved, ask the user instead of guessing.
Read-only.`;

export function makeQnaTeamInfoAgent(deps: QnaTeamInfoDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'planner.qna.teamInfo',
    description: 'Answers group/plan/member structure and skill questions in prose.',
    inputSchema: QnaSubAgentInputSchema,
    outputSchema: QnaSubAgentOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);
      rc.set('effective_permissions', ctx.effectivePermissions ?? new Set<string>());

      const out = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const agent = new Agent({
              id: 'planner.qna.teamInfo',
              name: 'Planner Team Info',
              instructions: INSTRUCTIONS,
              model: pickModel(ctx, deps.resolveModel),
              tools: {
                planner_listGroupMembers: plannerListGroupMembersTool,
                planner_listPlans: plannerListPlansTool,
                planner_listBuckets: plannerListBucketsTool,
                planner_searchGroupMembersBySkills: plannerSearchGroupMembersBySkillsTool,
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
