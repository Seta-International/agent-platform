import { createSkill, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  createRejectionReason,
  getCandidate,
  listCandidates,
  listTalentPool,
  openRequisition,
  rejectApplication,
  setRequisitionSkills,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('read candidates', () => {
  it('computes fit on the board and surfaces rejected candidates in the talent pool', async () => {
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
        const cat = await createSkillCategory({ input: { name: 'FE' }, session: catSession });
        const react = await createSkill({
          input: { category_id: cat.id, name: 'React' },
          session: catSession,
        });
        const { requisition_id } = await openRequisition({
          title: 'FE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        await setRequisitionSkills({
          requisition_id,
          skills: [{ skill_id: react.id, skill_name: 'React', min_level: 3 }],
          session: t.adminSession,
        });
        const { candidate_id, application_id } = await addCandidate({
          requisition_id,
          name: 'Ada',
          skills: [{ skill_id: react.id, skill_name: 'React', level: 4 }],
          session: t.adminSession,
        });

        const board = await listCandidates(t.adminSession);
        const row = board.find((r) => r.application_id === application_id);
        expect(row?.fit.strong).toBe(true);

        const detail = await getCandidate({ candidate_id, session: t.adminSession });
        expect(detail.timeline.length).toBeGreaterThan(0);
        expect(detail.skills).toHaveLength(1);

        const reason = await createRejectionReason({
          input: { label: 'X', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id,
          expected_version: 1,
          input: { reason_id: reason.id, tags: [] },
          session: t.adminSession,
        });
        const pool2 = await listTalentPool(t.adminSession);
        expect(pool2.some((p) => p.candidate_id === candidate_id)).toBe(true);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes active-application candidates from talent pool', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Active Req',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { candidate_id } = await addCandidate({
          requisition_id,
          name: 'Bob',
          skills: [],
          session: t.adminSession,
        });

        // candidate has an active application — must NOT appear in the talent pool
        const talentPool = await listTalentPool(t.adminSession);
        expect(talentPool.some((p) => p.candidate_id === candidate_id)).toBe(false);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('talent pool row carries terminal last_status and fit-based recommendations', async () => {
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
        const node = await createSkill({
          input: { category_id: cat.id, name: 'Node' },
          session: catSession,
        });

        // requisition 1 — candidate applied to and was rejected from
        const { requisition_id: req1 } = await openRequisition({
          title: 'BE Engineer',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        await setRequisitionSkills({
          requisition_id: req1,
          skills: [{ skill_id: node.id, skill_name: 'Node', min_level: 2 }],
          session: t.adminSession,
        });
        const { candidate_id, application_id } = await addCandidate({
          requisition_id: req1,
          name: 'Carol',
          skills: [{ skill_id: node.id, skill_name: 'Node', level: 3 }],
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Salary mismatch', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id,
          expected_version: 1,
          input: { reason_id: reason.id, tags: [] },
          session: t.adminSession,
        });

        // requisition 2 — open with matching skill, should appear in recommendations
        const { requisition_id: req2 } = await openRequisition({
          title: 'Senior BE',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        await setRequisitionSkills({
          requisition_id: req2,
          skills: [{ skill_id: node.id, skill_name: 'Node', min_level: 1 }],
          session: t.adminSession,
        });

        const talentPool = await listTalentPool(t.adminSession);
        const poolRow = talentPool.find((p) => p.candidate_id === candidate_id);
        expect(poolRow).toBeDefined();
        expect(poolRow?.last_status).toBe('rejected');
        expect(Array.isArray(poolRow?.recommended)).toBe(true);
        // req2 has overlapping skills — must surface in recommended
        expect(poolRow?.recommended.some((r) => r.requisition_id === req2)).toBe(true);
        const rec = poolRow?.recommended.find((r) => r.requisition_id === req2);
        expect(rec?.fit).toBeDefined();
        expect(typeof rec?.fit.score).toBe('number');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
