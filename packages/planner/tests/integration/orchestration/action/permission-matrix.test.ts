import { __resetBreakersForTests } from '@seta/agent-sdk';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import {
  MATRIX_ROLES,
  MATRIX_SCOPES,
  type MatrixRole,
  type MatrixScope,
  type MatrixWorld,
  seedMatrixWorld,
} from './matrix-actors.ts';
import { MATRIX_OPS, type MatrixOp, OPERATIONS } from './matrix-operations.ts';

/**
 * What SHOULD happen, written down before the code was consulted and then
 * corrected exactly once, against `shared-rbac`'s seed role definitions:
 *
 *  - planner.admin  — everything in their own group, nothing outside it.
 *  - planner.member — the same write set as admin ON TASKS; admin differs on plan
 *    and group administration, which this matrix does not cover.
 *  - planner.viewer — nothing, anywhere, EXCEPT commenting in their own group.
 *    `planner.task.comment.create` is granted to the viewer role on purpose
 *    (`packages/shared-rbac/src/inventory.ts`): anyone who can see a task may say
 *    something about it. It is the only write in the viewer's set, and it is the
 *    reason this function takes the operation as well as the role.
 *  - org.admin      — everything ANYWHERE IN THEIR TENANT (the documented bypass
 *    in `planner/rbac.ts` `isTenantWide`) and nothing in another tenant. That last
 *    row is the whole reason this role is in the matrix.
 *
 * Scope beats role: `other-tenant` is refused for everybody, including org.admin,
 * because every domain function compares `tenant_id` before anything else.
 */
// Not exported: biome's `noExportsInTest` forbids it, and the only reader is the
// snapshot at the bottom of this same file.
function expected(op: MatrixOp, role: MatrixRole, scope: MatrixScope): 'allowed' | 'refused' {
  if (scope === 'other-tenant') return 'refused';
  const reaches = role === 'org.admin' || scope === 'own-group' || scope === 'second-group';
  if (!reaches) return 'refused';
  if (role === 'planner.viewer') return op === 'comment' ? 'allowed' : 'refused';
  return 'allowed';
}

const cells: Array<[MatrixOp, MatrixRole, MatrixScope]> = MATRIX_OPS.flatMap((op) =>
  MATRIX_ROLES.flatMap((role) =>
    MATRIX_SCOPES.map((scope) => [op, role, scope] as [MatrixOp, MatrixRole, MatrixScope]),
  ),
);

/**
 * ONE database and ONE world for the whole file (§8.5).
 *
 * `withAgentTestDb` is callback-scoped, so the callback is held open on a promise
 * `afterAll` resolves — that keeps the pool wiring, the reset and the DROP
 * identical to every other suite instead of reimplementing them here. Sharing is
 * safe because every cell mints its own target tasks; nothing reads a row another
 * cell wrote.
 */
let world: MatrixWorld;
let pool: Pool;
let release: () => void;
let dbClosed: Promise<unknown>;

beforeAll(async () => {
  let ready: () => void = () => {};
  const seeded = new Promise<void>((resolve) => {
    ready = resolve;
  });
  dbClosed = withAgentTestDb(async (ctx) => {
    pool = ctx.pool;
    world = await seedMatrixWorld(ctx.pool);
    ready();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  // Race, not await: a failure inside the callback would otherwise hang here
  // forever instead of failing the suite.
  await Promise.race([seeded, dbClosed]);
}, 120_000);

afterAll(async () => {
  release?.();
  await dbClosed;
});

/**
 * `wrapExecute` records a thrown PlannerError as a breaker failure
 * (`sdks/agent/src/wrap-execute.ts` — `breaker.recordFailure('exception')`), and the
 * breaker is keyed on (toolId, tenantId) in module state. A matrix that refuses a
 * dozen cells in a row for ONE tenant therefore trips it, and later cells fail with
 * CIRCUIT_OPEN rather than with a permission answer.
 *
 * Reset per cell, so each one is asked in isolation. That a run of refusals opens
 * the breaker at all is a product question — a user who is refused three times
 * loses the tool for a while — but it belongs to whoever owns the breaker policy,
 * not to this matrix.
 */
beforeEach(() => {
  __resetBreakersForTests();
});

/** Pending approval rows belonging to this actor. The DB is shared across cells,
 *  so an unscoped count would fail a later cell for an earlier one's legitimate
 *  row. */
async function pendingApprovalsFor(userId: string): Promise<number> {
  const rows = await pool.query(
    'SELECT 1 FROM agent.workflow_approvals WHERE approver_user_id = $1',
    [userId],
  );
  return rows.rows.length;
}

describe('EV-07 — A2 write permissions', () => {
  it('covers exactly 84 base cells', () => {
    expect(cells).toHaveLength(84);
  });

  describe.each(cells)('%s / %s / %s', (op, role, scope) => {
    const want = expected(op, role, scope);

    // LAYER 1 — the tool's first pass. This is the layer where a missing gate
    // shows up as a CARD rather than as a write, which is why the assertion is
    // "refused AND no approval row" rather than just "refused".
    it(`tool first pass: ${want}`, async () => {
      const actorUserId = world.actors[role];
      let suspended = false;
      const attempt = OPERATIONS[op].viaTool({
        world,
        actorUserId,
        scope,
        suspend: async () => {
          suspended = true;
        },
      });

      if (want === 'allowed') {
        await expect(attempt).resolves.toBeDefined();
        expect(suspended).toBe(true);
      } else {
        // Either shape counts as a refusal: a thrown PlannerError, or a returned
        // `refusal` string. What must never happen is a card.
        await attempt.catch(() => undefined);
        expect(suspended).toBe(false);
        // The failure this exists for: a refused actor whose card was built
        // anyway leaves a pending row nobody can ever act on.
        expect(await pendingApprovalsFor(actorUserId)).toBe(0);
      }
    });

    // LAYER 2 — the port. A tool that forgot its own check is still not a leak.
    it(`port: ${want}`, async () => {
      const attempt = OPERATIONS[op].viaPort({
        world,
        actorUserId: world.actors[role],
        scope,
      });
      if (want === 'allowed') {
        await expect(attempt).resolves.toBeDefined();
      } else {
        await expect(attempt).rejects.toThrow();
      }
    });
  });
});

// The reviewer's artifact. 98 assertions are unreadable; one table is not. A
// permission change nobody intended shows up here as a diff in review even when
// every individual cell still passes its own expectation.
//
// The header's "seed roles only; no tenant role overlay" is not decoration:
// `buildActorSession` resolves seed-role permissions with NO per-tenant overlay
// (see its own comment), so a tenant that has customised its roles is outside what
// this table proves. Without the line, the table reads as a complete statement of
// who can do what.
it('emits the matrix as a readable table', () => {
  const header = [
    '# EV-07 — A2 write permissions (seed roles only; no tenant role overlay)',
    '',
    '| operation | role | own group | other group | other tenant |',
    '| --- | --- | --- | --- | --- |',
  ];
  const rows = MATRIX_OPS.flatMap((op) =>
    MATRIX_ROLES.map(
      (role) =>
        `| ${op} | ${role} | ${MATRIX_SCOPES.map((s) => expected(op, role, s)).join(' | ')} |`,
    ),
  );
  expect([...header, ...rows].join('\n')).toMatchSnapshot();
});

// The AC calls this out explicitly: "Users who belong to several groups are
// covered, not only single-group users." A second run of ONE role rather than a
// fourth axis — multiplying all 84 cells by four would buy nothing these two
// assertions do not already show.
describe('EV-07 — a member of two groups', () => {
  it('covers 14 cells', () => {
    expect(MATRIX_OPS.length * 2).toBe(14);
  });

  describe.each(MATRIX_OPS)('%s', (op) => {
    it('is allowed in BOTH of their own groups', async () => {
      for (const scope of ['own-group', 'second-group'] as const) {
        __resetBreakersForTests();
        let suspended = false;
        await OPERATIONS[op].viaTool({
          world,
          actorUserId: world.multiGroupUserId,
          scope,
          suspend: async () => {
            suspended = true;
          },
        });
        expect(suspended, `${op} in ${scope}`).toBe(true);
      }
    });

    it('is refused in a third group they do not belong to', async () => {
      let suspended = false;
      await OPERATIONS[op]
        .viaTool({
          world,
          actorUserId: world.multiGroupUserId,
          scope: 'third-group',
          suspend: async () => {
            suspended = true;
          },
        })
        .catch(() => undefined);
      expect(suspended).toBe(false);
      expect(await pendingApprovalsFor(world.multiGroupUserId)).toBe(0);
    });
  });
});
