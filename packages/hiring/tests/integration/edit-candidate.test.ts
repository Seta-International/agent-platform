import { createSkill, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidateSkill } from '../../src/backend/db/schema.ts';
import {
  addCandidate,
  openRequisition,
  setApplicationRating,
  setCandidateSkills,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('edit candidate', () => {
  it('replaces skills and sets a rating', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const catSession = {
          ...t.adminSession,
          permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
        };
        const cat = await createSkillCategory({ input: { name: 'BE' }, session: catSession });
        const s1 = await createSkill({
          input: { category_id: cat.id, name: 'Go' },
          session: catSession,
        });
        const s2 = await createSkill({
          input: { category_id: cat.id, name: 'Rust' },
          session: catSession,
        });
        const { requisition_id } = await openRequisition({
          title: 'BE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { candidate_id, application_id } = await addCandidate({
          requisition_id,
          name: 'Bob',
          skills: [{ skill_id: s1.id, skill_name: 'Go' }],
          session: t.adminSession,
        });

        await setCandidateSkills({
          candidate_id,
          skills: [{ skill_id: s2.id, skill_name: 'Rust', level: 5 }],
          session: t.adminSession,
        });
        const skills = await hiringDb()
          .select()
          .from(candidateSkill)
          .where(eq(candidateSkill.candidate_id, candidate_id));
        expect(skills).toHaveLength(1);
        expect(skills[0]?.skill_id).toBe(s2.id);

        const r = await setApplicationRating({
          application_id,
          expected_version: 1,
          rating: 4,
          session: t.adminSession,
        });
        expect(r.version).toBe(2);
        const [app] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, application_id));
        expect(app?.rating).toBe(4);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setApplicationRating rejects a stale expected_version with CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const catSession = {
          ...t.adminSession,
          permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
        };
        const cat = await createSkillCategory({ input: { name: 'BE2' }, session: catSession });
        const s = await createSkill({
          input: { category_id: cat.id, name: 'Kotlin' },
          session: catSession,
        });
        const { requisition_id } = await openRequisition({
          title: 'BE2',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id } = await addCandidate({
          requisition_id,
          name: 'Carol',
          skills: [{ skill_id: s.id, skill_name: 'Kotlin' }],
          session: t.adminSession,
        });

        // first call succeeds: version 1 → 2
        await setApplicationRating({
          application_id,
          expected_version: 1,
          rating: 3,
          session: t.adminSession,
        });

        // second call with stale expected_version: 1 must throw CONFLICT
        await expect(
          setApplicationRating({
            application_id,
            expected_version: 1,
            rating: 5,
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setCandidateSkills rejects a skill_id not in the catalog', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const catSession = {
          ...t.adminSession,
          permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
        };
        const cat = await createSkillCategory({ input: { name: 'BE3' }, session: catSession });
        const s = await createSkill({
          input: { category_id: cat.id, name: 'Elixir' },
          session: catSession,
        });
        const { requisition_id } = await openRequisition({
          title: 'BE3',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { candidate_id } = await addCandidate({
          requisition_id,
          name: 'Dan',
          skills: [{ skill_id: s.id, skill_name: 'Elixir' }],
          session: t.adminSession,
        });

        // ghost_id was never seeded into core.skill
        await expect(
          setCandidateSkills({
            candidate_id,
            skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Ghost', level: 1 }],
            session: t.adminSession,
          }),
        ).rejects.toThrow(/skill/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
