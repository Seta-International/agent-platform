// packages/pm/tests/integration/charter-migration.test.ts
// Proves the shipped 0006 data migration (charter -> project + project_approval) against a
// real Postgres. The migration runner has already DROPped pm.charter by the time this body
// runs (0007), so we recreate the pre-drop charter table, seed one row per status, execute
// the SHIPPED 0006 file verbatim, and assert the resulting project/project_approval rows.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const MIGRATION_0006 = fileURLToPath(
  new URL('../../drizzle/migrations/0006_migrate_charters_into_projects.sql', import.meta.url),
);

/** The pre-drop pm.charter column shape (recreated because 0007 already dropped the real table). */
const RECREATE_CHARTER = `
  CREATE TABLE pm.charter (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    pm_worker_id uuid NOT NULL,
    pmo_worker_id uuid,
    submitted_by_user_id uuid,
    decided_by_user_id uuid,
    budget_bmm numeric(15,4),
    team_size int,
    methodology text,
    pricing_model text,
    date_from date,
    date_to date,
    objective text,
    scope jsonb,
    status text NOT NULL,
    rejection_reason text,
    rejected_stage text,
    pmo_signed_off_by_user_id uuid,
    pmo_signed_off_at timestamptz,
    approved_at timestamptz,
    rejected_at timestamptz,
    project_id uuid,
    version int DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  )`;

/** Execute the shipped 0006 file: split on the breakpoint marker, drop `--` comment lines. */
async function runMigration0006(pool: Pool): Promise<void> {
  const raw = readFileSync(MIGRATION_0006, 'utf-8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

describe('0006 charter -> project + project_approval data migration', () => {
  it('maps statuses, copies governance, preserves identity, and does not duplicate approved', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acme') RETURNING id`,
          [t.tenant_id],
        );
        const accountId = acc.rows[0].id as string;

        await pool.query(RECREATE_CHARTER);

        const pmoUser = crypto.randomUUID();
        const deciderUser = crypto.randomUUID();

        // approved charter: pre-existing active project, project_id set. Must NOT spawn a duplicate.
        const approvedProj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, status)
           VALUES ($1,$2,'Approved Project','active') RETURNING id`,
          [t.tenant_id, accountId],
        );
        const approvedProjectId = approvedProj.rows[0].id as string;
        const approvedCharter = await pool.query(
          `INSERT INTO pm.charter
             (tenant_id, account_id, name, pm_worker_id, submitted_by_user_id, decided_by_user_id,
              status, project_id, approved_at, pmo_signed_off_by_user_id, pmo_signed_off_at)
           VALUES ($1,$2,'Approved Charter',$3,$4,$5,'approved',$6, now(), $7, now())
           RETURNING id`,
          [
            t.tenant_id,
            accountId,
            crypto.randomUUID(),
            t.admin_user_id,
            deciderUser,
            approvedProjectId,
            pmoUser,
          ],
        );
        const approvedCharterId = approvedCharter.rows[0].id as string;

        // submitted charter (no project)
        const submitted = await pool.query(
          `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, submitted_by_user_id, status)
           VALUES ($1,$2,'Submitted Charter',$3,$4,'submitted') RETURNING id`,
          [t.tenant_id, accountId, crypto.randomUUID(), t.admin_user_id],
        );
        const submittedId = submitted.rows[0].id as string;

        // pmo_approved charter (no project) with sign-off governance
        const pmoApproved = await pool.query(
          `INSERT INTO pm.charter
             (tenant_id, account_id, name, pm_worker_id, submitted_by_user_id, status,
              pmo_signed_off_by_user_id, pmo_signed_off_at)
           VALUES ($1,$2,'PMO Charter',$3,$4,'pmo_approved',$5, now()) RETURNING id`,
          [t.tenant_id, accountId, crypto.randomUUID(), t.admin_user_id, pmoUser],
        );
        const pmoApprovedId = pmoApproved.rows[0].id as string;

        // rejected charter (no project) with rejection governance
        const rejected = await pool.query(
          `INSERT INTO pm.charter
             (tenant_id, account_id, name, pm_worker_id, submitted_by_user_id, decided_by_user_id,
              status, rejected_at, rejected_stage, rejection_reason)
           VALUES ($1,$2,'Rejected Charter',$3,$4,$5,'rejected', now(), 'bod','over budget') RETURNING id`,
          [t.tenant_id, accountId, crypto.randomUUID(), t.admin_user_id, deciderUser],
        );
        const rejectedId = rejected.rows[0].id as string;

        // withdrawn charter (no project)
        const withdrawn = await pool.query(
          `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, submitted_by_user_id, status)
           VALUES ($1,$2,'Withdrawn Charter',$3,$4,'withdrawn') RETURNING id`,
          [t.tenant_id, accountId, crypto.randomUUID(), t.admin_user_id],
        );
        const withdrawnId = withdrawn.rows[0].id as string;

        await runMigration0006(pool);

        // --- assert: every charter now has a project in the mapped status ---
        const statusOf = async (projectId: string) => {
          const r = await pool.query(`SELECT status FROM pm.project WHERE id = $1`, [projectId]);
          return r.rows[0]?.status as string | undefined;
        };
        expect(await statusOf(approvedProjectId)).toBe('active'); // approved -> active
        expect(await statusOf(submittedId)).toBe('submitted');
        expect(await statusOf(pmoApprovedId)).toBe('pmo_approved');
        expect(await statusOf(rejectedId)).toBe('rejected');
        expect(await statusOf(withdrawnId)).toBe('withdrawn');

        // --- pre-active charters preserved identity: project.id = charter.id ---
        for (const id of [submittedId, pmoApprovedId, rejectedId, withdrawnId]) {
          const r = await pool.query(`SELECT id FROM pm.project WHERE id = $1`, [id]);
          expect(r.rows).toHaveLength(1);
        }

        // --- approved charter did NOT create a duplicate project ---
        const projectsForAccount = await pool.query(
          `SELECT id FROM pm.project WHERE account_id = $1 AND status = 'active'`,
          [accountId],
        );
        expect(projectsForAccount.rows).toHaveLength(1);
        expect(projectsForAccount.rows[0].id).toBe(approvedProjectId);

        // --- a project_approval per charter keyed on the resolved project id ---
        const approvalOf = async (projectId: string) => {
          const r = await pool.query(`SELECT * FROM pm.project_approval WHERE project_id = $1`, [
            projectId,
          ]);
          return r.rows[0];
        };

        // approved: keyed on the pre-existing project id, governance copied
        const approvedApproval = await approvalOf(approvedProjectId);
        expect(approvedApproval).toBeDefined();
        expect(approvedApproval.submitted_by_user_id).toBe(t.admin_user_id);
        expect(approvedApproval.decided_by_user_id).toBe(deciderUser);
        expect(approvedApproval.approved_at).not.toBeNull();
        expect(approvedApproval.version).toBe(1);
        void approvedCharterId;

        // pre-active approvals keyed on charter.id (identity preserved)
        const submittedApproval = await approvalOf(submittedId);
        expect(submittedApproval).toBeDefined();
        expect(submittedApproval.submitted_by_user_id).toBe(t.admin_user_id);

        const pmoApproval = await approvalOf(pmoApprovedId);
        expect(pmoApproval.pmo_signed_off_by_user_id).toBe(pmoUser);
        expect(pmoApproval.pmo_signed_off_at).not.toBeNull();

        const rejectedApproval = await approvalOf(rejectedId);
        expect(rejectedApproval.rejected_stage).toBe('bod');
        expect(rejectedApproval.rejection_reason).toBe('over budget');
        expect(rejectedApproval.rejected_at).not.toBeNull();

        const withdrawnApproval = await approvalOf(withdrawnId);
        expect(withdrawnApproval).toBeDefined();

        // exactly one approval per charter (5 charters -> 5 approvals)
        const approvalCount = await pool.query(
          `SELECT count(*)::int AS n FROM pm.project_approval WHERE tenant_id = $1`,
          [t.tenant_id],
        );
        expect(approvalCount.rows[0].n).toBe(5);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
