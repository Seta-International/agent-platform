import { createSkill, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidateEvent, candidateSkill } from '../../src/backend/db/schema.ts';
import {
  addCandidate,
  closeRequisition,
  hireApplication,
  openRequisition,
} from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('addCandidate', () => {
  it('creates a candidate, skills, and the first application atomically', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // createSkillCategory requires core.skill.manage; org.admin is the wildcard role that includes it
        const catSession = {
          ...t.adminSession,
          permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
        };
        const cat = await createSkillCategory({ input: { name: 'Frontend' }, session: catSession });
        const skill = await createSkill({
          input: { category_id: cat.id, name: 'React' },
          session: catSession,
        });
        const { requisition_id } = await openRequisition({
          title: 'FE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });

        const res = await addCandidate({
          requisition_id,
          name: 'Ada Lovelace',
          personal_email: 'ada@example.test',
          seniority: 'Senior',
          skills: [{ skill_id: skill.id, skill_name: 'React', level: 4 }],
          session: t.adminSession,
        });

        const apps = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, res.application_id));
        expect(apps[0]?.stage).toBe('new');
        expect(apps[0]?.status).toBe('active');
        expect(apps[0]?.kind).toBe('external');

        const skills = await hiringDb()
          .select()
          .from(candidateSkill)
          .where(eq(candidateSkill.candidate_id, res.candidate_id));
        expect(skills).toHaveLength(1);

        const events = await hiringDb()
          .select()
          .from(candidateEvent)
          .where(eq(candidateEvent.candidate_id, res.candidate_id));
        expect(events.map((e) => e.kind)).toContain('created');

        expect(await countEvents(pool, t.tenant_id, 'hiring.candidate.added')).toBe(1);
        expect(await countEvents(pool, t.tenant_id, 'hiring.application.created')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a skill id that is not in the catalog', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'FE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        await expect(
          addCandidate({
            requisition_id,
            name: 'Grace',
            skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Ghost', level: 3 }],
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

  // FUT-765: a requisition whose headcount is fully hired has no open openings left, yet its
  // status stays 'open' (hireApplication fills openings without closing the requisition). Adding
  // a candidate there strands them — they can never be hired. Reject at the source.
  it('rejects adding a candidate when the requisition headcount is already filled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'FE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const first = await addCandidate({
          requisition_id,
          name: 'Ada',
          session: t.adminSession,
        });
        // Hiring the only opening leaves the requisition status 'open' but with 0 open openings.
        await hireApplication({ application_id: first.application_id, session: t.adminSession });

        await expect(
          addCandidate({ requisition_id, name: 'Grace', session: t.adminSession }),
        ).rejects.toThrow(/filled|no.*opening|not open/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  // FUT-765: a manually-closed (filled) requisition is closed for hiring — never assignable.
  it('rejects adding a candidate to a requisition that is closed as filled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'FE',
          kind: 'new',
          headcount: 2,
          session: t.adminSession,
        });
        await closeRequisition({ requisition_id, status: 'filled', session: t.adminSession });

        await expect(
          addCandidate({ requisition_id, name: 'Grace', session: t.adminSession }),
        ).rejects.toThrow(/filled|not open/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
