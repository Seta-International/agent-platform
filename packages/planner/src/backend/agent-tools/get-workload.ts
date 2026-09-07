import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getGroupWorkload } from '../domain/get-group-workload.ts';
import { archivedGroupError, resolveGroupScope, withScopeError } from './resolve-scope.ts';

export const plannerGetWorkloadTool = defineAgentTool({
  id: 'planner_getWorkload',
  name: 'Get Workload',
  description:
    'Per-person open-task counts across a group, busiest first.\n' +
    'Resolves groupId automatically: provide groupName for name-based lookup, or omit both ' +
    'to auto-resolve when the user belongs to exactly one group.',
  input: z.object({
    groupId: z
      .string()
      .uuid()
      .optional()
      .describe('Group UUID. Optional if groupName provided or user has exactly one group.'),
    groupName: z.string().optional().describe('Group name (case-insensitive substring match).'),
  }),
  output: withScopeError(
    z.object({
      rows: z.array(
        z.object({
          userId: z.string(),
          displayName: z.string(),
          openTaskCount: z.number(),
        }),
      ),
    }),
  ),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

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

    return getGroupWorkload({ group_id: resolved.id, session });
  },
});
