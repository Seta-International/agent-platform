import { actorFromContext, defineAgentTool, recordEntityExposure } from '@seta/agent-sdk';
import type { SessionScope } from '@seta/core';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { listTasksBySkillTag } from '../domain/list-tasks-by-skill-tag.ts';

export const plannerListTasksBySkillTagInputSchema = z.object({
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(10)
    .describe(
      'Concrete skill tag term(s) extracted verbatim from the user request, e.g. ' +
        '["infrastructure"]. Matches case-insensitively; a task matches if its ' +
        'skill_tags contain ANY of these.',
    ),
  status: z
    .enum(['not_started', 'in_progress', 'completed', 'any'])
    .default('not_started')
    .describe(
      'Task status by percent_complete: not_started=0 ("need to do"), ' +
        'in_progress=50, completed=100, any=no status filter.',
    ),
  limit: z.number().int().min(1).max(50).default(10),
});

export const plannerListTasksBySkillTagOutputSchema = z.object({
  results: z.array(
    z.object({
      taskId: z.string().uuid(),
      groupId: z.string().uuid(),
      title: z.string(),
      status: z.enum(['not_started', 'in_progress', 'completed']),
      percentComplete: z.number(),
      assigneeUserIds: z.array(z.string().uuid()),
      skillTags: z.array(z.string()),
      createdAt: z.string(),
    }),
  ),
});

const STATUS_TO_PCT: Record<'not_started' | 'in_progress' | 'completed', 0 | 50 | 100> = {
  not_started: 0,
  in_progress: 50,
  completed: 100,
};

export interface PlannerListTasksBySkillTagToolDeps {
  sessionProvider?: (actor: { user_id: string }) => Promise<SessionScope>;
}

export function plannerListTasksBySkillTagTool(deps: PlannerListTasksBySkillTagToolDeps = {}) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;
  return defineAgentTool({
    id: 'planner_listTasksBySkillTag',
    name: 'List Tasks By Skill Tag',
    description:
      'Deterministic SQL filter over tasks by skill tag. Returns tasks whose skill_tags ' +
      'contain ANY of the given tags (case-insensitive), optionally narrowed by status. ' +
      'Use this — NOT planner_findSimilarTasks — whenever the user names a concrete skill ' +
      'or tag such as "infrastructure" or "devops". Same query + same data always returns ' +
      'the same result.',
    input: plannerListTasksBySkillTagInputSchema,
    output: plannerListTasksBySkillTagOutputSchema,
    rbac: 'planner.task.read',
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await resolveSession(actor);

      const { results } = await listTasksBySkillTag({
        tags: input.tags,
        percentComplete: input.status === 'any' ? undefined : STATUS_TO_PCT[input.status],
        limit: input.limit,
        session,
      });

      await recordEntityExposure(ctx as never, {
        recentTasks: results.map((r) => ({ taskId: r.taskId, title: r.title })),
      });

      return { results };
    },
  });
}
