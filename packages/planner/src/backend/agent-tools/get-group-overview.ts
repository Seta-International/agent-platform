import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listGroupMembers } from '../domain/list-group-members.ts';
import { listPlans } from '../domain/list-plans.ts';
import { PlannerError } from '../rbac.ts';
import { archivedGroupError, resolveGroupScope, withScopeError } from './resolve-scope.ts';

export const plannerGetGroupOverviewTool = defineAgentTool({
  id: 'planner_getGroupOverview',
  name: 'Get Group Overview',
  description:
    "Get a group's name, its members with roles, and the plans it contains.\n\n" +
    'Use for: "tell me about this group", "who is in my team and what are we working on?", ' +
    '"list the members and plans of group X".\n' +
    'Resolves groupId automatically: provide groupName for name-based lookup, or omit both ' +
    'to auto-resolve when the user belongs to exactly one group.\n' +
    'plans is [] if the caller lacks plan-read access — that alone does not fail the call.\n' +
    'Read-only. Does not modify membership or plans.',
  input: z.object({
    groupId: z
      .string()
      .uuid()
      .optional()
      .describe('Group UUID. Optional if groupName provided or user has exactly one group.'),
    groupName: z.string().optional().describe('Group name (case-insensitive substring match).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max members to return (default 500)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset for members (default 0)'),
  }),
  output: withScopeError(
    z.object({
      group: z.object({
        name: z.string(),
      }),
      totalMembers: z.number().describe('Total members in the group'),
      members: z.array(
        z.object({
          displayName: z.string(),
          email: z.string(),
          role: z.string().describe('Group role, e.g. owner / member'),
        }),
      ),
      plans: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
          }),
        )
        .describe('Active plans in this group; empty if caller lacks plan-read access'),
    }),
  ),
  rbac: 'planner.group.member.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);

    const resolved = await resolveGroupScope(session, {
      groupId: input.groupId,
      groupName: input.groupName,
    });
    if ('notFound' in resolved) {
      return { error: 'No accessible group found matching that criteria.' };
    }
    if ('archived' in resolved) {
      return { error: archivedGroupError(resolved.name) };
    }
    if ('ambiguous' in resolved) {
      const names = resolved.options.map((o) => o.name).join(', ');
      return { error: `Multiple groups found: ${names}. Please specify which one.` };
    }

    const page = await listGroupMembers({
      group_id: resolved.id,
      limit: input.limit,
      offset: input.offset,
      session,
    });

    let plans: { id: string; name: string }[] = [];
    try {
      const rows = await listPlans({ group_id: resolved.id, session });
      plans = rows.map((p) => ({ id: p.id, name: p.name }));
    } catch (err) {
      if (!(err instanceof PlannerError) || err.code !== 'FORBIDDEN') throw err;
    }

    return {
      group: { name: page.group.name },
      totalMembers: page.total,
      members: page.members.map((m) => ({
        displayName: m.display_name,
        email: m.email,
        role: m.role,
      })),
      plans,
    };
  },
});
