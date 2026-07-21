// packages/planner/tests/fixtures/golden/seed-login.ts
//
// In-process equivalent of `scripts/dev/seed-golden-dataset-login.ts` for the
// E2E eval lane: `seedGoldenDataset` writes only read-side projections and never
// creates an `identity.user` row, so the golden Actor has no roles and every
// RBAC-gated tool would deny. This provisions the Actor's identity + member
// roles + tenant product access so the real orchestrator's tools resolve a valid
// session via `buildActorSession`. Idempotent (mirrors the CLI script).
import { ensureLocalLogin, grantProductAccess, grantRole } from '@seta/identity';
import { PRODUCT_IDS } from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { ACTOR_EMAIL, ACTOR_NAME, ACTOR_PERSON_ID, ACTOR_USER_ID, TENANT_ID } from './constants.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };
const PASSWORD = 'ChangeMe@2026';

const ACTOR_ROLES: Array<{ role_slug: string; scope_kind: 'tenant' | 'self' }> = [
  { role_slug: 'planner.member', scope_kind: 'tenant' },
  { role_slug: 'knowledge.member', scope_kind: 'tenant' },
  { role_slug: 'agent.member', scope_kind: 'self' },
];

/** Provisions the golden Actor's login + roles + product access. */
export async function seedGoldenLogin(pool: Pool): Promise<void> {
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

  for (const role of ACTOR_ROLES) {
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
}
