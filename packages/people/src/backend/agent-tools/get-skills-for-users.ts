import type { CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { withTenantTx } from '@seta/shared-db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { peopleDb } from '../db/client.ts';
import { person, personSkill } from '../db/schema.ts';

const inputSchema = z.object({
  userIds: z.array(z.string().uuid()).describe('Linked user account ids to fetch skills for'),
});

const outputSchema = z.object({
  users: z.array(z.object({ userId: z.string(), skills: z.array(z.string()) })),
});

export type GetSkillsForUsersInput = z.infer<typeof inputSchema>;
export type GetSkillsForUsersOutput = z.infer<typeof outputSchema>;

/**
 * Cross-module read tool: each given user's catalog skill names (from People
 * person_skill, keyed to linked user accounts). Lets a group-scoped ranker
 * (planner.assignBySkill) judge a bounded set of known members by their real
 * skills, rather than re-discovering them through tenant-wide search. Users
 * with no linked account or no skills are simply omitted.
 */
export function buildGetSkillsForUsersSpec(): CrossModuleReadToolSpec<
  GetSkillsForUsersInput,
  GetSkillsForUsersOutput
> {
  return {
    id: 'people_getSkillsForUsers',
    description:
      "Return each given user's catalog skill names by user_id. Workflow use only (not LLM-visible).",
    inputSchema,
    outputSchema,
    rbac: 'people.worker.read',
    availableTo: 'all-specialists',
    execute: async ({ session, input }) => {
      const userIds = Array.from(new Set(input.userIds));
      if (userIds.length === 0) return { users: [] };

      const rows = await withTenantTx(peopleDb(), session.tenant_id, (tx) =>
        tx
          .select({ user_id: person.user_id, skill_name: personSkill.skill_name })
          .from(personSkill)
          .innerJoin(person, eq(person.id, personSkill.person_id))
          .where(
            and(
              eq(personSkill.tenant_id, session.tenant_id),
              isNotNull(person.user_id),
              inArray(person.user_id, userIds),
            ),
          ),
      );

      const byUser = new Map<string, string[]>();
      for (const row of rows) {
        if (!row.user_id) continue;
        const list = byUser.get(row.user_id);
        if (list) list.push(row.skill_name);
        else byUser.set(row.user_id, [row.skill_name]);
      }
      return { users: Array.from(byUser, ([userId, skills]) => ({ userId, skills })) };
    },
  };
}
