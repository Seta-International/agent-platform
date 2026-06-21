import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { approveCharter, createAccount, createAllocation, submitCharter } from '@seta/pm';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { accountFor } from './account-map.ts';
import type { AllocationRec, ProjectRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/pm' });

// Priority order for PM role derivation (case-insensitive)
const PM_ROLE_PRIORITY = ['pm', 'product director', 'techlead', 'director'];

async function findAccountId(tenantId: string, name: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM pm.account WHERE tenant_id = ${tenantId} AND name = ${name} LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

async function findProjectId(tenantId: string, name: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM pm.project WHERE tenant_id = ${tenantId} AND name = ${name} LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

async function allocationExists(
  tenantId: string,
  projectId: string,
  workerId: string,
  dateFrom: string,
): Promise<boolean> {
  const r = await coreDb().execute(
    sql`SELECT 1 FROM pm.allocation
        WHERE tenant_id = ${tenantId}
          AND project_id = ${projectId}
          AND worker_id = ${workerId}
          AND date_from = ${dateFrom}
          AND deleted_at IS NULL
        LIMIT 1`,
  );
  return r.rows.length > 0;
}

function derivePmEmployeeId(
  projectCode: string,
  membersByCode: Map<string, string[]>,
): string | undefined {
  const members = membersByCode.get(projectCode);
  if (!members || members.length === 0) return undefined;

  // membersWithRole stores [employeeId, roleLower]
  const membersWithRole: Array<{ employeeId: string; roleLower: string }> =
    (membersByCode as unknown as Map<string, Array<{ employeeId: string; roleLower: string }>>).get(
      `${projectCode}:roles`,
    ) ?? [];

  for (const priority of PM_ROLE_PRIORITY) {
    const match = membersWithRole.find((m) => m.roleLower === priority);
    if (match) return match.employeeId;
  }
  // Fall back to first member
  return members[0];
}

export async function seedPm(
  session: SessionScope,
  projects: ProjectRec[],
  allocations: AllocationRec[],
  people: Map<string, { workerId: string; userId: string }>,
): Promise<{
  accountByName: Map<string, string>;
  projectByCode: Map<string, string>;
  membersByCode: Map<string, string[]>;
  pmByCode: Map<string, { workerId: string; userId: string }>;
}> {
  // Build membersByCode from allocations: project_code → unique employeeIds (in CSV order)
  // Also store roles alongside for PM derivation
  const membersByCode = new Map<string, string[]>();
  const memberRolesByCode = new Map<string, Array<{ employeeId: string; roleLower: string }>>();

  for (const a of allocations) {
    if (!a.project_code || !a.employee_id) continue;

    const members = membersByCode.get(a.project_code) ?? [];
    if (!members.includes(a.employee_id)) {
      members.push(a.employee_id);
      membersByCode.set(a.project_code, members);
    }

    const roles = memberRolesByCode.get(a.project_code) ?? [];
    if (!roles.some((r) => r.employeeId === a.employee_id)) {
      roles.push({ employeeId: a.employee_id, roleLower: (a.role ?? '').toLowerCase().trim() });
      memberRolesByCode.set(a.project_code, roles);
    }
  }

  const accountByName = new Map<string, string>();
  const projectByCode = new Map<string, string>();
  const pmByCode = new Map<string, { workerId: string; userId: string }>();

  for (const p of projects) {
    const acc = accountFor(p.project_name);

    // Account — idempotent on name
    let aid =
      accountByName.get(acc.account_name) ??
      (await findAccountId(session.tenant_id, acc.account_name));
    if (!aid) {
      const created = await createAccount({
        name: acc.account_name,
        industry: acc.industry,
        session,
      });
      aid = created.account_id;
      log.info({ account_name: acc.account_name }, 'created account');
    }
    accountByName.set(acc.account_name, aid);

    // Project — idempotent on name
    let pid = await findProjectId(session.tenant_id, p.project_name);
    if (!pid) {
      // Derive PM from allocations (projects.csv pm_employee_id is blank)
      const pmEmployeeId = derivePmEmployeeIdFromRoles(p.code, membersByCode, memberRolesByCode);
      const pmPerson = pmEmployeeId ? people.get(pmEmployeeId) : undefined;

      if (!pmPerson) {
        log.warn(
          { project: p.project_name, code: p.code },
          'skipping project: no resolvable PM worker',
        );
        continue;
      }

      const teamSize = membersByCode.get(p.code)?.length ?? 0;

      const { charter_id } = await submitCharter({
        account_id: aid,
        name: p.project_name,
        pm_worker_id: pmPerson.workerId,
        methodology: 'scrum',
        pricing_model: 'time_materials',
        // budget_bmm is required by the completeness gate in approveCharter
        budget_bmm: 0,
        date_from: '2026-05-01',
        date_to: '2026-05-31',
        team_size: teamSize > 0 ? teamSize : undefined,
        session,
      });

      const approved = await approveCharter({ charter_id, session });
      pid = approved.project_id;
      log.info({ project: p.project_name, project_id: pid }, 'created project via charter');

      // Record PM for Task 6
      if (pmEmployeeId) {
        const pmInfo = people.get(pmEmployeeId);
        if (pmInfo) pmByCode.set(p.code, pmInfo);
      }
    } else {
      log.debug({ project: p.project_name }, 'project already exists, reusing');

      // Still resolve PM for Task 6 even when project already existed
      const pmEmployeeId = derivePmEmployeeIdFromRoles(p.code, membersByCode, memberRolesByCode);
      const pmInfo = pmEmployeeId ? people.get(pmEmployeeId) : undefined;
      if (pmInfo) pmByCode.set(p.code, pmInfo);
    }

    projectByCode.set(p.code, pid);
  }

  // Allocations — idempotent on (project_id, worker_id, date_from)
  let allocCreated = 0;
  let allocSkipped = 0;

  for (const a of allocations) {
    const pid = projectByCode.get(a.project_code);
    const person = people.get(a.employee_id);

    if (!pid || !person) {
      allocSkipped++;
      continue;
    }

    const dateFrom = `${a.month}-01`;
    const exists = await allocationExists(session.tenant_id, pid, person.workerId, dateFrom);
    if (exists) {
      allocSkipped++;
      continue;
    }

    await createAllocation({
      project_id: pid,
      worker_id: person.workerId,
      role: a.role || null,
      date_from: dateFrom,
      date_to: `${a.month}-31`,
      bucket: 'billable',
      planned_pct: a.ratio_pct,
      minutes_per_day: Math.round((a.ratio_pct / 100) * 480),
      status: 'committed',
      session,
    });
    allocCreated++;
  }

  log.info(
    {
      accounts: accountByName.size,
      projects: projectByCode.size,
      allocations_created: allocCreated,
      allocations_skipped: allocSkipped,
    },
    'phase-pm done',
  );

  return { accountByName, projectByCode, membersByCode, pmByCode };
}

function derivePmEmployeeIdFromRoles(
  projectCode: string,
  membersByCode: Map<string, string[]>,
  memberRolesByCode: Map<string, Array<{ employeeId: string; roleLower: string }>>,
): string | undefined {
  const members = membersByCode.get(projectCode);
  if (!members || members.length === 0) return undefined;

  const roles = memberRolesByCode.get(projectCode) ?? [];

  for (const priority of PM_ROLE_PRIORITY) {
    const match = roles.find((m) => m.roleLower === priority);
    if (match) return match.employeeId;
  }

  // Fall back to first member
  return members[0];
}
