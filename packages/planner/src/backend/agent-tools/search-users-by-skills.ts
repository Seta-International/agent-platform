import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { searchUsersBySkills } from '../domain/search-users-by-skills.ts';

export const identitySearchUsersBySkillsTool = defineCopilotTool({
  id: 'identity_searchUsersBySkills',
  name: 'Search Users By Skills',
  description: 'Rank group members by overlap against requested skills.',
  input: z.object({
    groupId: z.string().uuid().describe('The group ID to search within'),
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

    const rows = await searchUsersBySkills({
      group_id: input.groupId,
      skills: input.skills,
      limit: input.limit ?? 5,
      session,
    });

    return {
      candidates: rows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        matchedSkills: r.matchedSkills,
        score: r.score,
      })),
    };
  },
});
