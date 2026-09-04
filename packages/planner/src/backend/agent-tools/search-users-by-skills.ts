import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { getPersonSkills } from '@seta/people';
import { z } from 'zod';
import { getTask } from '../domain/get-task.ts';
import { listGroupMembers } from '../domain/list-group-members.ts';
import { archivedGroupError, resolveGroupScope, withScopeError } from './resolve-scope.ts';

interface SkillCandidate {
  userId: string;
  displayName: string;
  matchedSkills: string[];
  score: number;
}

function matchSkills(userSkills: readonly string[], requestedSkills: readonly string[]): string[] {
  const available = new Set(userSkills.map((s) => s.toLowerCase()));
  return requestedSkills
    .map((skill) => skill.toLowerCase())
    .filter((skill) => available.has(skill));
}

export const plannerSearchGroupMembersBySkillsTool = defineAgentTool({
  id: 'planner_searchGroupMembersBySkills',
  name: 'Search Group Members By Skills',
  description:
    'Find and rank group members whose skills exactly match the requested skill tags.\n\n' +
    'Use for: building a candidate shortlist for task assignment within a specific group; ' +
    '"who in this group knows docker?"; "find backend developers in group X".\n' +
    'Do NOT use for broad topic or semantic search — use people_matchUsersByTopic instead.\n\n' +
    'Resolves groupId automatically: provide groupName for name-based lookup, or omit both ' +
    'to auto-resolve when the user belongs to exactly one group.',
  input: z.object({
    groupId: z
      .string()
      .uuid()
      .optional()
      .describe('Group UUID. Optional if groupName provided or user has exactly one group.'),
    groupName: z.string().optional().describe('Group name (case-insensitive substring match).'),
    taskId: z
      .string()
      .uuid()
      .optional()
      .describe('Optional task ID; current assignees are excluded from candidates'),
    skills: z.array(z.string().min(1)).min(1).describe('Skills to match against'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe('Maximum number of candidates to return'),
  }),
  output: withScopeError(
    z.object({
      candidates: z.array(
        z.object({
          userId: z.string().describe('User ID'),
          displayName: z.string().describe('User display name'),
          matchedSkills: z.array(z.string()).describe('Skills that matched the query'),
          score: z.number().describe('Number of matched skills'),
        }),
      ),
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

    const groupId = resolved.id;
    const excludeUserIds = new Set<string>([actor.user_id]);
    if (input.taskId) {
      try {
        const task = await getTask({ task_id: input.taskId, session });
        for (const assignee of task.assignees) excludeUserIds.add(assignee.user_id);
      } catch (_err) {
        // Task may have been deleted or belong to a different context; skip assignee exclusion.
      }
    }

    const firstPage = await listGroupMembers({
      group_id: groupId,
      limit: 100,
      session,
    });
    const members = [...firstPage.members];
    for (let offset = members.length; offset < firstPage.total; offset += 100) {
      const page = await listGroupMembers({
        group_id: groupId,
        limit: 100,
        offset,
        session,
      });
      members.push(...page.members);
    }

    const candidates: SkillCandidate[] = [];
    for (const member of members) {
      if (excludeUserIds.has(member.user_id)) continue;
      // Live skills from People (the owning module); member.display_name comes from
      // the group-member read, which is already tenant- and group-scoped.
      const skills = await getPersonSkills(session, { user_id: member.user_id });
      const matchedSkills = matchSkills(skills, input.skills);
      if (matchedSkills.length === 0) continue;
      candidates.push({
        userId: member.user_id,
        displayName: member.display_name,
        matchedSkills,
        score: matchedSkills.length,
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      candidates: candidates.slice(0, input.limit ?? 5),
    };
  },
});
