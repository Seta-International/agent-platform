import type { CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { canonicalizeSkills } from '@seta/core';
import { withTenantTx } from '@seta/shared-db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { peopleDb } from '../db/client.ts';
import { person, personSkill } from '../db/schema.ts';

const inputSchema = z.object({
  labels: z
    .array(z.string().min(1))
    .describe('Task label names to match against people skills, via the canonical skill catalog'),
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
 * Cross-module read tool: exact match of canonical skill ids against People
 * person_skill (a person's techstack), keyed to linked user accounts.
 *
 * Consumed by planner.assignBySkill (exact branch). Callers resolve free-text
 * task labels to canonical core.skill ids (see core.canonicalizeSkills) before
 * calling — so "reactjs" (label) and "React" (skill) match through the catalog,
 * not by string equality. Persons with no linked user account are dropped —
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
      'Exact match of canonical core.skill ids against people skills → userId + matched skills + overlap count. ' +
      'Workflow use only (not LLM-visible). For semantic/topic search use people_matchUsersByTopic.',
    inputSchema,
    outputSchema,
    rbac: 'people.worker.read',
    availableTo: 'all-specialists',
    execute: async ({ session, input }) => {
      // Resolve free-text labels to canonical catalog skill ids so "reactjs"
      // (label) matches the "React" skill through the catalog, not by string
      // equality. Labels that name no catalog skill simply contribute nothing.
      const canonical = await canonicalizeSkills({ tenant_id: session.tenant_id }, input.labels);
      const skillIds = canonical.map((c) => c.skill_id);
      if (skillIds.length === 0) return { hits: [] };

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
              inArray(personSkill.skill_id, skillIds),
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
