import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { holdRequisition } from '@seta/hiring';
import type { Actor } from '@seta/identity';
import { deactivateUser } from '@seta/identity';
import { setPortalAccess } from '@seta/people';
import { createAllocation } from '@seta/pm';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { EmployeeRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/edge-cases' });

async function workerPersonId(workerId: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT person_id FROM people.worker WHERE id = ${workerId} AND deleted_at IS NULL LIMIT 1`,
  );
  return (r.rows[0] as { person_id: string } | undefined)?.person_id;
}

export async function seedEdgeCases(
  session: SessionScope,
  people: Map<string, { workerId: string; userId: string }>,
  employees: EmployeeRec[],
): Promise<void> {
  const actor: Actor = { type: 'cli', user_id: session.user_id };

  // Resolve deterministic targets
  const firstInMap = employees.find((e) => people.has(e.id));
  const devEmployees = employees.filter((e) => e.primary_role === 'DEV' && people.has(e.id));

  // 1. No-portal worker — flip portal_access to false
  try {
    if (!firstInMap) {
      log.warn('edge-cases: no workers in people map, skipping no-portal');
    } else {
      const { workerId } = people.get(firstInMap.id)!;
      const personId = await workerPersonId(workerId);
      if (!personId) {
        log.warn({ worker_id: workerId }, 'edge-cases: person_id not found, skipping no-portal');
      } else {
        await setPortalAccess({ worker_id: personId, enabled: false, session });
        log.info({ worker_id: personId }, 'edge-cases: portal_access=false');
      }
    }
  } catch (err) {
    log.warn({ err }, 'edge-cases: no-portal skipped');
  }

  // 2. Deactivated user — pick first DEV that isn't also the no-portal target
  try {
    const noPortalId = firstInMap?.id;
    const deactivateTarget = devEmployees.find((e) => e.id !== noPortalId) ?? devEmployees[0];
    if (!deactivateTarget) {
      log.warn('edge-cases: no DEV employee found, skipping deactivated-user');
    } else {
      const { userId } = people.get(deactivateTarget.id)!;
      await deactivateUser(userId, actor);
      log.info({ user_id: userId }, 'edge-cases: user deactivated');
    }
  } catch (err) {
    log.warn({ err }, 'edge-cases: deactivated-user skipped');
  }

  // 3. On-hold requisition — transition first seeded requisition from open → on_hold
  try {
    const r = await coreDb().execute(
      sql`SELECT id FROM hiring.requisition WHERE title LIKE '% — %' ORDER BY created_at LIMIT 1`,
    );
    const reqId = (r.rows[0] as { id: string } | undefined)?.id;
    if (!reqId) {
      log.warn('edge-cases: no requisition found, skipping on-hold');
    } else {
      await holdRequisition({ requisition_id: reqId, session });
      log.info({ requisition_id: reqId }, 'edge-cases: requisition on_hold');
    }
  } catch (err) {
    log.warn({ err }, 'edge-cases: on-hold skipped (already on_hold or not found)');
  }

  // 4. Over-allocated worker — add a second allocation on a different project
  try {
    const secondDev = devEmployees[1] ?? devEmployees[0];
    if (!secondDev) {
      log.warn('edge-cases: no DEV employee for over-allocation, skipping');
    } else {
      const { workerId } = people.get(secondDev.id)!;

      const injected = await coreDb().execute(
        sql`SELECT 1 FROM pm.allocation
            WHERE tenant_id = ${session.tenant_id}
              AND worker_id = ${workerId}
              AND bucket = 'internal'
              AND date_from = '2026-05-01'
              AND deleted_at IS NULL
            LIMIT 1`,
      );
      if (injected.rows.length > 0) {
        log.info({ worker_id: workerId }, 'edge-cases: over-allocation already exists, skipping');
      } else {
        const altProjectResult = await coreDb().execute(
          sql`SELECT id FROM pm.project
              WHERE tenant_id = ${session.tenant_id}
                AND id NOT IN (
                  SELECT project_id FROM pm.allocation
                  WHERE worker_id = ${workerId} AND deleted_at IS NULL
                )
              LIMIT 1`,
        );
        const altProjectId = (altProjectResult.rows[0] as { id: string } | undefined)?.id;
        if (!altProjectId) {
          log.warn(
            { worker_id: workerId },
            'edge-cases: no alternate project found, skipping over-allocation',
          );
        } else {
          await createAllocation({
            project_id: altProjectId,
            worker_id: workerId,
            role: 'DEV',
            date_from: '2026-05-01',
            date_to: '2026-05-31',
            bucket: 'internal',
            planned_pct: 80,
            minutes_per_day: 384,
            status: 'committed',
            session,
          });
          log.info(
            { worker_id: workerId, project_id: altProjectId },
            'edge-cases: over-allocation created',
          );
        }
      }
    }
  } catch (err) {
    log.warn({ err }, 'edge-cases: over-allocation skipped');
  }
}
