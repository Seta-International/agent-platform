import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listGroupMembers } from '../domain/list-group-members.ts';

export const plannerListGroupMembersTool = defineAgentTool({
  id: 'planner_listGroupMembers',
  name: 'List Group Members',
  description:
    'List the members of a group with their roles and the total member count.\n\n' +
    'Use for: "how many people are in this group?", "who is in my team?", ' +
    '"list the members of group X". Requires a groupId — resolve it from page ' +
    'context or a prior planner_listPlans / planner_getTask result.\n' +
    'Read-only. Does not modify membership.',
  input: z.object({
    groupId: z.string().uuid().describe('The group whose members to list'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max members to return (default 500)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    total: z.number().describe('Total members in the group'),
    members: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        email: z.string(),
        role: z.string().describe('Group role, e.g. owner / member'),
      }),
    ),
  }),
  rbac: 'planner.group.member.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const page = await listGroupMembers({
      group_id: input.groupId,
      limit: input.limit,
      offset: input.offset,
      session,
    });
    return {
      total: page.total,
      members: page.members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        email: m.email,
        role: m.role,
      })),
    };
  },
});
