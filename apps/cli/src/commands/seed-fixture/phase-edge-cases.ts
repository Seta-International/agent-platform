import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { holdRequisition } from '@seta/hiring';
import type { Actor } from '@seta/identity';
import { deactivateUser } from '@seta/identity';
import { createAllocation } from '@seta/pm';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { EmployeeRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/edge-cases' });

export async function seedEdgeCases(
  session: SessionScope,
  people: Map<string, { workerId: string; userId: string }>,
  employees: EmployeeRec[],
): Promise<void> {
  const actor: Actor = { type: 'cli', user_id: session.user_id };

  // Resolve deterministic targets
  const devEmployees = employees.filter((e) => e.primary_role === 'DEV' && people.has(e.id));

  // 1. Deactivated user — pick first DEV
  try {
    const deactivateTarget = devEmployees[0];
    if (!deactivateTarget) {
      log.warn('edge-cases: no DEV employee found, skipping deactivated-user');
    } else {
      const entry = people.get(deactivateTarget.id);
      if (!entry) throw new Error('deactivate target not in people map');
      const { userId } = entry;
      await deactivateUser(userId, actor);
      log.info({ user_id: userId }, 'edge-cases: user deactivated');
    }
  } catch (err) {
    log.warn({ err }, 'edge-cases: deactivated-user skipped');
  }

  // 2. On-hold requisition — transition first seeded requisition from open → on_hold
  try {
    const r = await coreDb().execute(
      sql`SELECT id FROM hiring.requisition
          WHERE tenant_id = ${session.tenant_id} AND title LIKE '% — %'
          ORDER BY created_at LIMIT 1`,
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

  // 3. Over-allocated worker — add a second allocation on a different project
  try {
    const secondDev = devEmployees[1] ?? devEmployees[0];
    if (!secondDev) {
      log.warn('edge-cases: no DEV employee for over-allocation, skipping');
    } else {
      const entry = people.get(secondDev.id);
      if (!entry) throw new Error('over-allocation target not in people map');
      const { workerId } = entry;

      const injected = await coreDb().execute(
        sql`SELECT 1 FROM pm.allocation
            WHERE tenant_id = ${session.tenant_id}
              AND person_id = ${workerId}
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
                  WHERE person_id = ${workerId} AND deleted_at IS NULL
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
            // Open-ended so the deliberate >100% overlap is active today and surfaces in the
            // utilization panel as well as the monthly grid.
            date_to: null,
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
