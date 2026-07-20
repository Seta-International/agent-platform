// scripts/dev/seed-golden-dataset-login.ts
//
// Grants a real local-password login to the golden dataset's Actor
// ("Anh Nguyen") so a developer can log into the dev web app and manually
// chat with the query agent as the exact user the eval fixture was built
// around. `seedGoldenDataset` only writes read-side data (people.person,
// planner.assignee_projection, etc.) — it never creates an identity.user
// row, so nobody in the golden dataset can log in until this runs.
//
// Must run AFTER `pnpm seed:golden` (needs the tenant + person rows to
// already exist). Idempotent — safe to re-run.
//
// Usage:
//   pnpm seed:golden:login
//   DATABASE_URL=postgresql://... pnpm seed:golden:login

import { ensureLocalLogin, grantRole } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import pg from 'pg';
import {
  ACTOR_EMAIL,
  ACTOR_NAME,
  ACTOR_PERSON_ID,
  ACTOR_USER_ID,
  TENANT_ID,
} from '../../packages/planner/tests/fixtures/golden/index.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://seta:seta@localhost:5542/seta';
const PASSWORD = process.env.GOLDEN_LOGIN_PASSWORD ?? 'ChangeMe@2026';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };

async function main() {
  initPools({ databaseUrl: DATABASE_URL });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // `createUser()` always mints its own random id, so it can't be used to
    // attach a login to the golden dataset's fixed ACTOR_USER_ID — insert
    // the identity.user row directly instead.
    await pool.query(
      `INSERT INTO identity."user" (id, email, name, tenant_id, person_id, email_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO NOTHING`,
      [ACTOR_USER_ID, ACTOR_EMAIL, ACTOR_NAME, TENANT_ID, ACTOR_PERSON_ID],
    );

    await ensureLocalLogin(
      { user_id: ACTOR_USER_ID, tenant_id: TENANT_ID, password: PASSWORD },
      CLI_ACTOR,
    );

    // Matches scripts/dev/tenant-bootstrap.sh's member role set: planner
    // access, knowledge-base access, and self-scoped agent/chat access.
    // grantRole has no unique constraint on (user_id, role_slug, scope) —
    // guard against duplicate grants on re-run.
    const roles: Array<{ role_slug: string; scope_kind: 'tenant' | 'self' }> = [
      { role_slug: 'planner.member', scope_kind: 'tenant' },
      { role_slug: 'knowledge.member', scope_kind: 'tenant' },
      { role_slug: 'agent.member', scope_kind: 'self' },
    ];
    for (const role of roles) {
      const { rows } = await pool.query(
        `SELECT 1 FROM identity.role_assignments
         WHERE user_id = $1 AND tenant_id = $2 AND role_slug = $3 AND scope_kind = $4
           AND revoked_at IS NULL
         LIMIT 1`,
        [ACTOR_USER_ID, TENANT_ID, role.role_slug, role.scope_kind],
      );
      if (rows.length > 0) continue;
      await grantRole(
        {
          user_id: ACTOR_USER_ID,
          tenant_id: TENANT_ID,
          role_slug: role.role_slug,
          scope_kind: role.scope_kind,
          scope_id: null,
        },
        CLI_ACTOR,
      );
    }

    console.log('Golden dataset login ready:');
    console.log(`  Email:    ${ACTOR_EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
  } finally {
    await pool.end();
    await closePools();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
