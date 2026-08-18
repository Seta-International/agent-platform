import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, allocation, project } from '../../src/backend/db/schema.ts';
import { assertProjectManageable } from '../../src/backend/domain/assert-project-manageable.ts';
import { listAccounts, listAllocations, listProjects } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('FUT-912: RA Monitoring account and project scope for allocated accounts', () => {
  it('user with allocation on an unmanaged account sees the account and project in RA Monitoring filters', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const W_am = crypto.randomUUID();
        const W_other_am = crypto.randomUUID();

        // 1. Account managed by W_am directly (e.g. Motion Global)
        const [a1] = await pmDb()
          .insert(account)
          .values({ tenant_id: t.tenant_id, name: 'Motion Global', am_person_id: W_am })
          .returning({ id: account.id });
        const mgAccountId = a1!.id;

        // 2. Account managed by someone else or unmanaged (e.g. Gridbeyond)
        const [a2] = await pmDb()
          .insert(account)
          .values({ tenant_id: t.tenant_id, name: 'Gridbeyond', am_person_id: W_other_am })
          .returning({ id: account.id });
        const gbAccountId = a2!.id;

        // 3. Project on Motion Global
        const [p1] = await pmDb()
          .insert(project)
          .values({
            tenant_id: t.tenant_id,
            account_id: mgAccountId,
            name: 'Motion Global Project',
          })
          .returning({ id: project.id });
        const mgProjectId = p1!.id;

        // 4. Project on Gridbeyond (e.g. GB - VP)
        const [p2] = await pmDb()
          .insert(project)
          .values({
            tenant_id: t.tenant_id,
            account_id: gbAccountId,
            name: 'GB - VP',
          })
          .returning({ id: project.id });
        const gbProjectId = p2!.id;

        // 5. Allocation on Gridbeyond for W_am
        const [allocRow] = await pmDb()
          .insert(allocation)
          .values({
            tenant_id: t.tenant_id,
            project_id: gbProjectId,
            person_id: W_am,
            date_from: '2026-01-01',
            status: 'committed',
            planned_pct: '60',
          })
          .returning({ id: allocation.id });
        const gbAllocId = allocRow!.id;

        // Session for W_am as an AM persona with self-scoped pm.manager
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
          assignments: [{ role_slug: 'pm.manager', scope_kind: 'self', scope_id: null }],
          worker_id: W_am,
        });

        // Test 1: listAccounts must include Gridbeyond in addition to Motion Global
        const accounts = await listAccounts(session);
        const accountIds = accounts.map((a) => a.account_id);
        expect(accountIds).toContain(mgAccountId);
        expect(accountIds).toContain(gbAccountId);

        // Test 2: listProjects must include GB - VP
        const projects = await listProjects(session);
        const projectIds = projects.map((p) => p.project_id);
        expect(projectIds).toContain(mgProjectId);
        expect(projectIds).toContain(gbProjectId);

        // Test 3: listAllocations must return the allocation row on Gridbeyond
        const allocations = await listAllocations({ session });
        const allocationIds = allocations.map((a) => a.allocation_id);
        expect(allocationIds).toContain(gbAllocId);

        // Test 4: Verify can_manage vs read permissions
        // W_am manages Motion Global (is AM) -> can_manage = true
        const mgProj = projects.find((p) => p.project_id === mgProjectId);
        expect(mgProj?.can_manage).toBe(true);

        // W_am is only allocated to GB - VP (not AM, not PM) -> can_manage = false
        const gbProj = projects.find((p) => p.project_id === gbProjectId);
        expect(gbProj?.can_manage).toBe(false);

        // Attempting to mutate GB - VP allocations should fail with FORBIDDEN (since readable but unmanaged)
        await expect(assertProjectManageable(gbProjectId, session)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
