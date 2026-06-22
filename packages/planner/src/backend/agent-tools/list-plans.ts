import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listPlans } from '../domain/list-plans.ts';

export const plannerListPlansTool = defineAgentTool({
  id: 'planner_listPlans',
  name: 'List Plans',
  description:
    'List the plans in a group (active plans only by default).\n\n' +
    'Use for: "what plans exist in this group?", "show me the plans for my team". ' +
    'Omit groupId to list all plans the user can access across their groups.\n' +
    'Read-only.',
  input: z.object({
    groupId: z
      .string()
      .uuid()
      .optional()
      .describe('Restrict to one group; omit for all accessible plans'),
  }),
  output: z.object({
    plans: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        groupId: z.string(),
      }),
    ),
  }),
  rbac: 'planner.plan.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const rows = await listPlans({ group_id: input.groupId, session });
    return {
      plans: rows.map((p) => ({ id: p.id, name: p.name, groupId: p.group_id })),
    };
  },
});
