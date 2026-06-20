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
});
