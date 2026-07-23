// scripts/dev/seed-golden-dataset-login.ts
//
// Grants real local-password logins to the golden dataset so a developer can
// log into the dev web app and drive the eval fixture by hand:
//   • the Actor ("Anh Nguyen") — the "chatting user" every query-agent
//     testcase is built around (planner/knowledge/agent member roles);
//   • the tenant admin — full org.admin access for setup/inspection.
// It also grants tenant-scoped product access (planner/people/pm/hiring),
// which covers every user in the tenant, so both logins can actually reach
// the product surfaces.
//
// `seedGoldenDataset` only writes read-side projection data (people.person,
// planner.assignee_projection, etc.) — it never creates identity.user rows,
// so nobody in the golden dataset can log in until this runs.
//
// Must run AFTER `pnpm seed:golden` (needs the tenant + person rows to
// already exist). Idempotent — safe to re-run.
//
// Usage:
//   pnpm seed:golden:login
//   DATABASE_URL=postgresql://... pnpm seed:golden:login

import { ensureLocalLogin, grantProductAccess, grantRole } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { PRODUCT_IDS } from '@seta/shared-rbac';
import pg from 'pg';
import {
  ACTOR_EMAIL,
  ACTOR_NAME,
  ACTOR_PERSON_ID,
  ACTOR_USER_ID,
  ADMIN_EMAIL,
  ADMIN_USER_ID,
  TENANT_ID,
} from '../../packages/planner/tests/fixtures/golden/index.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://seta:seta@localhost:5542/seta';
const PASSWORD = process.env.GOLDEN_LOGIN_PASSWORD ?? 'ChangeMe@2026';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

interface LoginSpec {
  user_id: string;
  email: string;
  name: string;
  /** Person record this login maps to; tenant admins have none (NULL). */
  person_id: string | null;
  roles: Array<{ role_slug: string; scope_kind: 'tenant' | 'self' }>;
}

async function provisionLogin(pool: pg.Pool, spec: LoginSpec): Promise<void> {
  // `createUser()` always mints its own random id, so it can't attach a login
  // to the golden dataset's fixed user ids — insert the identity.user row
  // directly instead.
  await pool.query(
    `INSERT INTO identity."user" (id, email, name, tenant_id, person_id, email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (id) DO NOTHING`,
    [spec.user_id, spec.email, spec.name, TENANT_ID, spec.person_id],
  );

  await ensureLocalLogin(
    { user_id: spec.user_id, tenant_id: TENANT_ID, password: PASSWORD },
    CLI_ACTOR,
  );

  // grantRole has no unique constraint on (user_id, role_slug, scope) —
  // guard against duplicate grants on re-run.
  for (const role of spec.roles) {
    const { rows } = await pool.query(
      `SELECT 1 FROM identity.role_assignments
       WHERE user_id = $1 AND tenant_id = $2 AND role_slug = $3 AND scope_kind = $4
         AND revoked_at IS NULL
       LIMIT 1`,
      [spec.user_id, TENANT_ID, role.role_slug, role.scope_kind],
    );
    if (rows.length > 0) continue;
    await grantRole(
      {
        user_id: spec.user_id,
        tenant_id: TENANT_ID,
        role_slug: role.role_slug,
        scope_kind: role.scope_kind,
        scope_id: null,
      },
      CLI_ACTOR,
    );
  }
}

async function main() {
  initPools({ databaseUrl: DATABASE_URL });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Actor: matches scripts/dev/tenant-bootstrap.sh's member role set.
    await provisionLogin(pool, {
      user_id: ACTOR_USER_ID,
      email: ACTOR_EMAIL,
      name: ACTOR_NAME,
      person_id: ACTOR_PERSON_ID,
      roles: [
        { role_slug: 'planner.member', scope_kind: 'tenant' },
        { role_slug: 'knowledge.member', scope_kind: 'tenant' },
        { role_slug: 'agent.member', scope_kind: 'self' },
      ],
    });

    // Tenant admin: org.admin like scripts/dev/tenant-create. No person record.
    await provisionLogin(pool, {
      user_id: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      name: 'SETA Demo Admin',
      person_id: null,
      roles: [{ role_slug: 'org.admin', scope_kind: 'tenant' }],
    });

    // Tenant-scoped product access covers every user in the tenant, so this
    // single set of grants unlocks the product surfaces for both logins.
    // grantProductAccess upserts, so it's safe to re-run.
    for (const product_id of PRODUCT_IDS) {
      await grantProductAccess(
        {
          tenant_id: TENANT_ID,
          subject_type: 'tenant',
          subject_id: TENANT_ID,
          product_id,
          effect: 'grant',
          granted_via: 'cli',
        },
        CLI_ACTOR,
      );
    }

    console.log('Golden dataset logins ready (password for both):', PASSWORD);
    console.log(`  Member : ${ACTOR_EMAIL}`);
    console.log(`  Admin  : ${ADMIN_EMAIL}`);
  } finally {
    await pool.end();
    await closePools();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
