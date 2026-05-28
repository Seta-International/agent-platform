import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession, getUserProfile } from '@seta/identity';
import { z } from 'zod';
import { getTask } from '../domain/get-task.ts';
import { listGroupMembers } from '../domain/list-group-members.ts';

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

export const identitySearchUsersBySkillsTool = defineAgentTool({
  id: 'identity_searchUsersBySkills',
  name: 'Search Users By Skills',
  description:
    'Find and rank members who have the requested skills. Use for: (1) answering ' +
    '"who knows X / who has Y skill" queries; (2) building a shortlist when assigning a task. ' +
    'Requires a groupId — use the group from the current task or plan context. ' +
    'When no group is in context, call this tool once per accessible group from the session and merge results.',
  input: z.object({
    groupId: z.string().uuid().describe('The group ID to search within'),
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
  output: z.object({
    candidates: z.array(
      z.object({
        userId: z.string().describe('User ID'),
        displayName: z.string().describe('User display name'),
        matchedSkills: z.array(z.string()).describe('Skills that matched the query'),
        score: z.number().describe('Number of matched skills'),
      }),
    ),
  }),
  rbac: 'planner.group.member.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const excludeUserIds = new Set<string>([actor.user_id]);
    if (input.taskId) {
      const task = await getTask({ task_id: input.taskId, session });
      for (const assignee of task.assignees) excludeUserIds.add(assignee.user_id);
    }

    const firstPage = await listGroupMembers({
      group_id: input.groupId,
      limit: 100,
      session,
    });
    const members = [...firstPage.members];
    for (let offset = members.length; offset < firstPage.total; offset += 100) {
      const page = await listGroupMembers({
        group_id: input.groupId,
        limit: 100,
        offset,
        session,
      });
      members.push(...page.members);
    }

    const candidates: SkillCandidate[] = [];
    for (const member of members) {
      if (excludeUserIds.has(member.user_id)) continue;
      const profile = await getUserProfile(member.user_id);
      if (!profile || profile.tenant_id !== session.tenant_id || profile.deactivated_at) continue;
      const matchedSkills = matchSkills(profile.skills, input.skills);
      if (matchedSkills.length === 0) continue;
      candidates.push({
        userId: profile.user_id,
        displayName: profile.display_name,
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
