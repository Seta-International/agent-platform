import { createTool } from '@mastra/core/tools';
import { searchUsersBySkills } from '@seta/planner';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

export const identitySearchUsersBySkillsTool = registerToolPermission(
  createTool({
    id: 'identity_searchUsersBySkills',
    description: 'Rank group members by overlap against requested skills.',
    inputSchema: z.object({
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
    outputSchema: z.object({
      candidates: z.array(
        z.object({
          userId: z.string().describe('User ID'),
          displayName: z.string().describe('User display name'),
          matchedSkills: z.array(z.string()).describe('Skills that matched the query'),
          score: z.number().describe('Number of matched skills'),
        }),
      ),
    }),
    requestContextSchema: RequestContextSchema,
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
  }),
  'planner.group.member.read',
);
