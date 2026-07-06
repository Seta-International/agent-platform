import type { CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { withTenantTx } from '@seta/shared-db';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { peopleDb } from '../db/client.ts';
import { person, personSkill } from '../db/schema.ts';

const inputSchema = z.object({
  labels: z
    .array(z.string().min(1))
    .describe('Task label names to match against people skills (case-insensitive)'),
});

const outputSchema = z.object({
  hits: z.array(
    z.object({
      userId: z.string(),
      matchedSkills: z.array(z.string()),
      overlap: z.number(),
    }),
  ),
});

export type SearchUsersBySkillExactInput = z.infer<typeof inputSchema>;
export type SearchUsersBySkillExactOutput = z.infer<typeof outputSchema>;

/**
 * Cross-module read tool: exact match (case-insensitive) of task labels against
 * People person_skill (a person's techstack), keyed to linked user accounts.
 *
 * Consumed by planner.assignBySkill (exact branch). It replaces the dead
 * assignee_projection.skills read: worker skills moved to People, so the planner
 * projection column is no longer event-populated (see
 * planner searchUsersBySkills). Persons with no linked user account are dropped —
 * downstream assigns to a user_id. Availability (ooo/busy) is enforced by the
 * caller against its own projection.
 */
export function buildSearchUsersBySkillExactSpec(): CrossModuleReadToolSpec<
  SearchUsersBySkillExactInput,
  SearchUsersBySkillExactOutput
> {
  return {
    id: 'people_searchUsersBySkillExact',
    description:
      'Exact match (case-insensitive) of task labels against people skills → userId + matched skills + overlap count. ' +
      'Workflow use only (not LLM-visible). For semantic/topic search use people_matchUsersByTopic.',
    inputSchema,
    outputSchema,
    rbac: 'people.worker.read',
    availableTo: 'all-specialists',
    execute: async ({ session, input }) => {
      const norm = input.labels.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0);
      if (norm.length === 0) return { hits: [] };

      // Workflow callers hold no request-pinned tenant connection, so set the
      // RLS GUC explicitly — person / person_skill FORCE row-level security and
      // return zero rows without app.tenant_id.
      const rows = await withTenantTx(peopleDb(), session.tenant_id, (tx) =>
        tx
          .select({ user_id: person.user_id, skill_name: personSkill.skill_name })
          .from(personSkill)
          .innerJoin(person, eq(person.id, personSkill.person_id))
          .where(
            and(
              eq(personSkill.tenant_id, session.tenant_id),
              isNotNull(person.user_id),
              inArray(sql`lower(${personSkill.skill_name})`, norm),
            ),
          ),
      );

      // Group by user → distinct matched skills (original casing) + overlap count.
      const byUser = new Map<string, Set<string>>();
      for (const row of rows) {
        if (!row.user_id) continue;
        let set = byUser.get(row.user_id);
        if (!set) {
          set = new Set<string>();
          byUser.set(row.user_id, set);
        }
        set.add(row.skill_name);
      }

      return {
        hits: Array.from(byUser, ([userId, skills]) => ({
          userId,
          matchedSkills: Array.from(skills),
          overlap: skills.size,
        })),
      };
    },
  };
}
