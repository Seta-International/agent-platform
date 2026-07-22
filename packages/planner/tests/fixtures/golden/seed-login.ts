// packages/planner/tests/fixtures/golden/seed-login.ts
//
// In-process equivalent of `scripts/dev/seed-golden-dataset-login.ts` for the
// E2E eval lane: `seedGoldenDataset` writes only read-side projections and never
// creates an `identity.user` row, so seeded people have no roles and every
// RBAC-gated tool would deny. This provisions the Actor's identity + member
// roles + tenant product access, and gives every other seeded member the
// `planner.member` role, so the real orchestrator's tools resolve a valid
// session via `buildActorSession` no matter which member a case runs as.
// Idempotent (mirrors the CLI script).
import { ensureLocalLogin, grantProductAccess, grantRole } from '@seta/identity';
import { PRODUCT_IDS } from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { ACTOR_EMAIL, ACTOR_NAME, ACTOR_PERSON_ID, ACTOR_USER_ID, TENANT_ID } from './constants.ts';
import { ALL_PEOPLE } from './people.ts';

const CLI_ACTOR = { type: 'cli' as const, user_id: null };
const PASSWORD = 'ChangeMe@2026';

interface RoleGrant {
  role_slug: string;
  scope_kind: 'tenant' | 'self';
}

// The Actor is the "chatting user" most cases are built around: full member
// login across planner/knowledge/agent.
const ACTOR_ROLES: RoleGrant[] = [
  { role_slug: 'planner.member', scope_kind: 'tenant' },
  { role_slug: 'knowledge.member', scope_kind: 'tenant' },
  { role_slug: 'agent.member', scope_kind: 'self' },
];

// Every other seeded member gets the planner member tier so any case can run
// as that member and RBAC-gated planner read tools resolve. `planner.member`
// includes `planner.reporting.read` (getOpenTaskCount / getWorkload / getStats
// / getBoardSnapshot / queryTasks), so no member is denied on a read.
const MEMBER_ROLES: RoleGrant[] = [{ role_slug: 'planner.member', scope_kind: 'tenant' }];

interface UserRow {
  user_id: string;
  email: string;
  name: string;
  person_id: string;
}

/** Inserts the fixed-id identity.user row (createUser mints its own id, so we
 *  insert directly). Idempotent. */
async function ensureUserRow(pool: Pool, u: UserRow): Promise<void> {
  await pool.query(
    `INSERT INTO identity."user" (id, email, name, tenant_id, person_id, email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (id) DO NOTHING`,
    [u.user_id, u.email, u.name, TENANT_ID, u.person_id],
  );
}

/** Grants the given roles, skipping any already-live assignment (grantRole has
 *  no unique constraint, so guard against duplicates on re-run). */
async function grantRoles(pool: Pool, userId: string, roles: RoleGrant[]): Promise<void> {
  for (const role of roles) {
    const { rows } = await pool.query(
      `SELECT 1 FROM identity.role_assignments
        WHERE user_id = $1 AND tenant_id = $2 AND role_slug = $3 AND scope_kind = $4
          AND revoked_at IS NULL
        LIMIT 1`,
      [userId, TENANT_ID, role.role_slug, role.scope_kind],
    );
    if (rows.length > 0) continue;
    await grantRole(
      {
        user_id: userId,
        tenant_id: TENANT_ID,
        role_slug: role.role_slug,
        scope_kind: role.scope_kind,
        scope_id: null,
      },
      CLI_ACTOR,
    );
  }
}

/** Provisions the golden Actor's login + roles and grants every other seeded
 *  member the planner.member role, then grants tenant-scoped product access. */
export async function seedGoldenLogin(pool: Pool): Promise<void> {
  // Actor: identity row + real local-password login + full member roles.
  await ensureUserRow(pool, {
    user_id: ACTOR_USER_ID,
    email: ACTOR_EMAIL,
    name: ACTOR_NAME,
    person_id: ACTOR_PERSON_ID,
  });
  await ensureLocalLogin(
    { user_id: ACTOR_USER_ID, tenant_id: TENANT_ID, password: PASSWORD },
    CLI_ACTOR,
  );
  await grantRoles(pool, ACTOR_USER_ID, ACTOR_ROLES);

  // Every other seeded member: identity row + planner.member role. No password
  // login is provisioned — the eval builds their session directly via
  // buildActorSession (whoAmI + role assignments), not interactive login, so we
  // skip the (expensive) argon2 hash for non-actors.
  for (const p of ALL_PEOPLE) {
    if (p.user_id === ACTOR_USER_ID) continue;
    await ensureUserRow(pool, {
      user_id: p.user_id,
      email: p.email,
      name: p.full_name,
      person_id: p.person_id,
    });
    await grantRoles(pool, p.user_id, MEMBER_ROLES);
  }

  // Tenant-scoped product access covers every user in the tenant.
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
