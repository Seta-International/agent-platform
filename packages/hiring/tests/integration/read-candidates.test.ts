import { createSkill, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application } from '../../src/backend/db/schema.ts';
import {
  addCandidate,
  createRejectionReason,
  getCandidate,
  getCandidateStageCounts,
  listCandidates,
  listTalentPool,
  openRequisition,
  rejectApplication,
  setRequisitionSkills,
} from '../../src/index.ts';
import { buildSession, seedOwnedProject, seedTenant } from '../helpers.ts';

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
        expect(row?.applied_at).toBeInstanceOf(Date);
        expect(row?.skills).toEqual([{ skill_id: react.id, skill_name: 'React', level: 4 }]);

        const detail = await getCandidate({ candidate_id, session: t.adminSession });
        expect(detail.timeline.length).toBeGreaterThan(0);
        expect(detail.skills).toHaveLength(1);
        expect(Array.isArray(detail.applications)).toBe(true);
        expect(detail.applications).toHaveLength(1);
        const activeApp =
          detail.applications.find((a) => a.status === 'active') ?? detail.applications[0];
        expect(activeApp).toBeDefined();
        expect(activeApp!.application_id).toBe(application_id);
        expect(activeApp!.requisition_title).toBe('FE');
        expect(activeApp!.fit).toBeDefined();
        expect(typeof activeApp!.fit.score).toBe('number');
        expect(activeApp!.fit.strong).toBe(true);

        const reason = await createRejectionReason({
          input: { label: 'X', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id,
          expected_version: 1,
          input: { reason: 'Not a fit', reason_id: reason.id, tags: [] },
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
          input: { reason: 'Not a fit', reason_id: reason.id, tags: [] },
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

  it('a BOD/PMO session sees every candidate across accounts on the board (FUT-335)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountA = crypto.randomUUID();
        const accountB = crypto.randomUUID();

        const { requisition_id: reqA } = await openRequisition({
          title: 'Req in account A',
          kind: 'new',
          headcount: 1,
          account_id: accountA,
          session: t.adminSession,
        });
        const { requisition_id: reqB } = await openRequisition({
          title: 'Req in account B',
          kind: 'new',
          headcount: 1,
          account_id: accountB,
          session: t.adminSession,
        });
        const { application_id: appA } = await addCandidate({
          requisition_id: reqA,
          name: 'Alice',
          skills: [],
          session: t.adminSession,
        });
        const { application_id: appB } = await addCandidate({
          requisition_id: reqB,
          name: 'Bob',
          skills: [],
          session: t.adminSession,
        });

        const bod = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.bod', 'hiring.viewer_all'],
        });

        const board = await listCandidates(bod);
        const ids = board.map((r) => r.application_id);
        expect(ids).toContain(appA);
        expect(ids).toContain(appB);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('an AM sees only candidates applying to roles on their own account (FUT-336)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amWorkerId = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
        });
        // AM scope now resolves via @seta/pm (listAccountIdsManagedBy → pm.account.am_person_id).
        const { account_id: myAccount } = await createAccount({
          name: 'My Account',
          am_worker_id: amWorkerId,
          session: manager,
        });
        const { account_id: otherAccount } = await createAccount({
          name: 'Other Account',
          session: manager,
        });

        const { requisition_id: myReq } = await openRequisition({
          title: 'Req on my account',
          kind: 'new',
          headcount: 1,
          account_id: myAccount,
          session: t.adminSession,
        });
        const { requisition_id: otherReq } = await openRequisition({
          title: 'Req on another account',
          kind: 'new',
          headcount: 1,
          account_id: otherAccount,
          session: t.adminSession,
        });
        const { application_id: mine } = await addCandidate({
          requisition_id: myReq,
          name: 'Alice',
          skills: [],
          session: t.adminSession,
        });
        await addCandidate({
          requisition_id: otherReq,
          name: 'Bob',
          skills: [],
          session: t.adminSession,
        });

        const am = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: amWorkerId,
        });

        const board = await listCandidates(am);
        const ids = board.map((r) => r.application_id);
        expect(ids).toEqual([mine]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('an EM/TL/PM sees only candidates applying to roles on their own project (FUT-337)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const ownerWorkerId = crypto.randomUUID();
        const otherProject = crypto.randomUUID();

        const manager = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
        });
        // Owner scope now resolves via @seta/pm (listProjectIdsOwnedBy → pm.project_access).
        const { project_id: myProject } = await seedOwnedProject({
          tenant_id: t.tenant_id,
          session: manager,
          ownerWorkerId,
        });

        const { requisition_id: myReq } = await openRequisition({
          title: 'Req on my project',
          kind: 'new',
          headcount: 1,
          project_id: myProject,
          session: t.adminSession,
        });
        const { requisition_id: otherReq } = await openRequisition({
          title: 'Req on another project',
          kind: 'new',
          headcount: 1,
          project_id: otherProject,
          session: t.adminSession,
        });
        const { application_id: mine } = await addCandidate({
          requisition_id: myReq,
          name: 'Alice',
          skills: [],
          session: t.adminSession,
        });
        await addCandidate({
          requisition_id: otherReq,
          name: 'Bob',
          skills: [],
          session: t.adminSession,
        });

        const owner = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['hiring.viewer'],
          assignments: [{ role_slug: 'hiring.viewer', scope_kind: 'self', scope_id: null }],
          worker_id: ownerWorkerId,
        });

        const board = await listCandidates(owner);
        const ids = board.map((r) => r.application_id);
        expect(ids).toEqual([mine]);
      } finally {
        resetPmDb();
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stage counts include hired applications and bucket rejected/transferred as cancelled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Stage counts req',
          kind: 'new',
          headcount: 3,
          session: t.adminSession,
        });
        const { application_id: newAppId } = await addCandidate({
          requisition_id,
          name: 'Newbie',
          skills: [],
          session: t.adminSession,
        });
        const { application_id: hiredAppId } = await addCandidate({
          requisition_id,
          name: 'Hired One',
          skills: [],
          session: t.adminSession,
        });
        const { application_id: rejectedAppId } = await addCandidate({
          requisition_id,
          name: 'Rejected One',
          skills: [],
          session: t.adminSession,
        });

        // No "mark as hired" mutation exists yet — set the status directly to simulate the
        // future hire flow and prove the read side already surfaces it correctly.
        await hiringDb()
          .update(application)
          .set({ status: 'hired' })
          .where(eq(application.id, hiredAppId));

        const reason = await createRejectionReason({
          input: { label: 'Not a fit', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id: rejectedAppId,
          expected_version: 1,
          input: { reason: 'Not a fit', reason_id: reason.id, tags: [] },
          session: t.adminSession,
        });

        const counts = await getCandidateStageCounts(t.adminSession);
        expect(counts.new).toBe(1);
        expect(counts.hired).toBe(1);
        expect(counts.cancelled).toBe(1);
        expect(counts.screening + counts.interview + counts.offer).toBe(0);

        const board = await listCandidates(t.adminSession);
        const ids = board.map((r) => r.application_id);
        expect(ids).toContain(newAppId);
        expect(ids).toContain(hiredAppId);
        expect(ids).not.toContain(rejectedAppId);
        expect(board.find((r) => r.application_id === hiredAppId)?.status).toBe('hired');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filters the board by contact email and phone via q (FUT-833)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Search Req',
          kind: 'new',
          headcount: 2,
          session: t.adminSession,
        });
        const { application_id: adaApp } = await addCandidate({
          requisition_id,
          name: 'Ada',
          personal_email: 'ada@example.com',
          phone: '+84123456789',
          skills: [],
          session: t.adminSession,
        });
        await addCandidate({
          requisition_id,
          name: 'Bob',
          personal_email: 'bob@example.com',
          phone: '+84987654321',
          skills: [],
          session: t.adminSession,
        });

        // Search by email — only Ada's row returns
        const byEmail = await listCandidates(t.adminSession, 'ada@example.com');
        expect(byEmail.map((r) => r.application_id)).toEqual([adaApp]);
        // Search by phone — only Ada's row returns
        const byPhone = await listCandidates(t.adminSession, '123456789');
        expect(byPhone.map((r) => r.application_id)).toEqual([adaApp]);
        // Case-insensitive partial email
        const partial = await listCandidates(t.adminSession, 'BOB');
        expect(partial.map((r) => r.name)).toEqual(['Bob']);
        // Empty q returns the full board
        const all = await listCandidates(t.adminSession, '');
        expect(all.length).toBe(2);
        // No-match returns nothing
        const none = await listCandidates(t.adminSession, 'zzz-nope');
        expect(none).toEqual([]);
        // Rows must NOT expose the contact PII
        expect('contact' in (byEmail[0] as object)).toBe(false);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
