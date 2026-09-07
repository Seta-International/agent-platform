import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import {
  assignTask,
  createBucket,
  createGroup,
  createPlan,
  createTask,
  deleteGroup,
} from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { buildAdminSession } from './commands/seed.ts';
import { parseEnv } from './env.ts';

const log = pino({ name: 'cli/dev-seed-planner-archived' });

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? 'member1@seta-international.test';
const RESET = process.env.RESET === '1';

const BUCKETS = ['To Do', 'In Progress', 'Done'] as const;

type Assignee = 'admin' | 'member';

interface TaskSpec {
  title: string;
  percent: 0 | 50 | 100;
  dueInDays: number | null;
  deferred?: boolean;
  priority?: 1 | 3 | 5 | 9;
  assignee: Assignee;
}

interface GroupSpec {
  name: string;
  description: string;
  plan: string;
  archived: boolean;
  withMember: boolean;
  tasks: TaskSpec[];
}

const FIXTURE: GroupSpec[] = [
  {
    name: 'Aurora Platform',
    description: 'Active delivery group — the control set for FUT-832.',
    plan: 'Aurora Delivery Board',
    archived: false,
    withMember: false,
    tasks: [
      {
        title: 'Ship the tenant settings redesign',
        percent: 0,
        dueInDays: 6,
        priority: 3,
        assignee: 'admin',
      },
      {
        title: 'Wire SSO metadata refresh',
        percent: 50,
        dueInDays: 2,
        priority: 3,
        assignee: 'admin',
      },
      {
        title: 'Fix the flaky checkout e2e run',
        percent: 0,
        dueInDays: -3,
        priority: 1,
        assignee: 'admin',
      },
      {
        title: 'Draft the read-model caching RFC',
        percent: 0,
        dueInDays: null,
        deferred: true,
        priority: 9,
        assignee: 'admin',
      },
      {
        title: 'Publish the Q3 release notes',
        percent: 100,
        dueInDays: -10,
        priority: 5,
        assignee: 'admin',
      },
      {
        title: 'Retire the legacy upload endpoint',
        percent: 100,
        dueInDays: -20,
        priority: 5,
        assignee: 'admin',
      },
    ],
  },
  {
    name: 'Orion Support',
    description: 'Active support group — the control set for FUT-832.',
    plan: 'Orion Support Board',
    archived: false,
    withMember: false,
    tasks: [
      {
        title: 'Triage the pager backlog',
        percent: 50,
        dueInDays: 1,
        priority: 1,
        assignee: 'admin',
      },
      {
        title: 'Write the March incident postmortem',
        percent: 0,
        dueInDays: -1,
        priority: 3,
        assignee: 'admin',
      },
      {
        title: 'Close out the quarterly SLA report',
        percent: 100,
        dueInDays: -5,
        priority: 5,
        assignee: 'admin',
      },
    ],
  },
  {
    name: 'Helios Migration',
    description: 'Archived group — nothing here should reach an assistant answer.',
    plan: 'Helios Cutover Board',
    archived: true,
    withMember: true,
    tasks: [
      {
        title: 'Rotate the staging TLS certificates',
        percent: 0,
        dueInDays: -8,
        priority: 1,
        assignee: 'admin',
      },
      {
        title: 'Cut over the billing read replica',
        percent: 50,
        dueInDays: -2,
        priority: 1,
        assignee: 'admin',
      },
      {
        title: 'Decommission the old job runner',
        percent: 0,
        dueInDays: 4,
        priority: 3,
        assignee: 'admin',
      },
      {
        title: 'Archive the Helios migration runbook',
        percent: 100,
        dueInDays: -30,
        priority: 5,
        assignee: 'admin',
      },
      {
        title: 'Backfill the legacy invoice rows',
        percent: 50,
        dueInDays: -15,
        priority: 1,
        assignee: 'member',
      },
      {
        title: 'Re-point the Helios DNS aliases',
        percent: 0,
        dueInDays: null,
        deferred: true,
        priority: 9,
        assignee: 'member',
      },
      {
        title: 'Sign off the data-parity report',
        percent: 100,
        dueInDays: -25,
        priority: 5,
        assignee: 'member',
      },
    ],
  },
  {
    name: 'Nimbus Legacy',
    description: 'Archived group — nothing here should reach an assistant answer.',
    plan: 'Nimbus Wind-down Board',
    archived: true,
    withMember: true,
    tasks: [
      {
        title: 'Export the Nimbus audit trail',
        percent: 0,
        dueInDays: -12,
        priority: 3,
        assignee: 'member',
      },
      {
        title: 'Shut down the Nimbus staging stack',
        percent: 50,
        dueInDays: 3,
        priority: 3,
        assignee: 'member',
      },
      {
        title: 'Confirm the final Nimbus invoice',
        percent: 100,
        dueInDays: -18,
        priority: 5,
        assignee: 'member',
      },
      {
        title: 'Delete the orphaned Nimbus buckets',
        percent: 0,
        dueInDays: 9,
        priority: 9,
        assignee: 'admin',
      },
    ],
  },
];

const GROUP_NAMES = FIXTURE.map((g) => g.name);

async function resolveTenantByAdmin(email: string): Promise<string> {
  const r = await coreDb().execute(
    sql`SELECT tenant_id FROM identity."user" WHERE lower(email) = lower(${email}) LIMIT 1`,
  );
  const id = (r.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  if (!id) throw new Error(`No user ${email} — run scripts/dev/tenant-bootstrap.sh first`);
  return id;
}

async function resolveUserId(tenantId: string, email: string): Promise<string | null> {
  const r = await coreDb().execute(
    sql`SELECT id FROM identity."user" WHERE tenant_id = ${tenantId} AND lower(email) = lower(${email}) LIMIT 1`,
  );
  return (r.rows[0] as { id?: string } | undefined)?.id ?? null;
}

async function findGroupIdAnyState(tenantId: string, name: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM planner.groups WHERE tenant_id = ${tenantId} AND name = ${name} ORDER BY created_at DESC LIMIT 1`,
  );
  return (r.rows[0] as { id?: string } | undefined)?.id;
}

async function resetFixture(tenantId: string): Promise<void> {
  const names = sql.join(
    GROUP_NAMES.map((n) => sql`${n}`),
    sql`, `,
  );
  const groupIds = sql`SELECT id FROM planner.groups WHERE tenant_id = ${tenantId} AND name IN (${names})`;
  const planIds = sql`SELECT id FROM planner.plans WHERE group_id IN (${groupIds})`;
  await coreDb().execute(sql`DELETE FROM planner.tasks WHERE plan_id IN (${planIds})`);
  await coreDb().execute(sql`DELETE FROM planner.plans WHERE group_id IN (${groupIds})`);
  await coreDb().execute(
    sql`DELETE FROM planner.groups WHERE tenant_id = ${tenantId} AND name IN (${names})`,
  );
  log.info({ groups: GROUP_NAMES.length }, 'fixture reset');
}

function dueAt(dueInDays: number | null): string | undefined {
  if (dueInDays === null) return undefined;
  return new Date(Date.now() + dueInDays * 86_400_000).toISOString();
}

function bucketFor(percent: 0 | 50 | 100): (typeof BUCKETS)[number] {
  if (percent === 100) return 'Done';
  if (percent === 50) return 'In Progress';
  return 'To Do';
}

async function seedGroup(
  spec: GroupSpec,
  session: SessionScope,
  userIds: Record<Assignee, string>,
): Promise<{ created: boolean; tasks: number }> {
  const existing = await findGroupIdAnyState(session.tenant_id, spec.name);
  if (existing) {
    log.info({ group: spec.name }, 'group already exists, skipping (RESET=1 to rebuild)');
    return { created: false, tasks: 0 };
  }

  const group = await createGroup({
    tenant_id: session.tenant_id,
    name: spec.name,
    description: spec.description,
    initial_members: spec.withMember
      ? [{ user_id: userIds.member, role: 'member' as const }]
      : undefined,
    session,
  });

  const plan = await createPlan({ group_id: group.id, name: spec.plan, session });

  const bucketIds = new Map<string, string>();
  for (const name of BUCKETS) {
    const bucket = await createBucket({ plan_id: plan.id, name, session });
    bucketIds.set(name, bucket.id);
  }

  for (const t of spec.tasks) {
    const task = await createTask({
      plan_id: plan.id,
      bucket_id: bucketIds.get(bucketFor(t.percent)),
      title: t.title,
      description: `${spec.name} — seeded for FUT-832 reproduction.`,
      percent_complete: t.percent,
      is_deferred: t.deferred ?? false,
      priority_number: t.priority ?? 5,
      due_at: dueAt(t.dueInDays),
      session,
    });
    await assignTask({ task_id: task.id, user_id: userIds[t.assignee], session });
  }

  if (spec.archived) {
    await deleteGroup({ group_id: group.id, expected_version: group.version, session });
  }

  log.info(
    { group: spec.name, plan: spec.plan, tasks: spec.tasks.length, archived: spec.archived },
    'group seeded',
  );
  return { created: true, tasks: spec.tasks.length };
}

interface Rollup {
  activeOpen: number;
  activeDone: number;
  archivedOpen: number;
  archivedDone: number;
  archivedOverdue: number;
}

async function rollupFor(tenantId: string, userId: string): Promise<Rollup> {
  const r = await coreDb().execute(sql`
    SELECT
      (g.deleted_at IS NOT NULL) AS archived,
      count(*) FILTER (WHERE t.progress <> 'done')::int AS open_count,
      count(*) FILTER (WHERE t.progress = 'done')::int AS done_count,
      count(*) FILTER (WHERE t.progress <> 'done' AND t.due_at < now())::int AS overdue_count
    FROM planner.task_assignments ta
    JOIN planner.tasks t ON t.id = ta.task_id AND t.deleted_at IS NULL
    JOIN planner.plans p ON p.id = t.plan_id
    JOIN planner.groups g ON g.id = p.group_id
    WHERE t.tenant_id = ${tenantId} AND ta.user_id = ${userId}
    GROUP BY 1
  `);
  const out: Rollup = {
    activeOpen: 0,
    activeDone: 0,
    archivedOpen: 0,
    archivedDone: 0,
    archivedOverdue: 0,
  };
  for (const row of r.rows as {
    archived: boolean;
    open_count: number;
    done_count: number;
    overdue_count: number;
  }[]) {
    if (row.archived) {
      out.archivedOpen = row.open_count;
      out.archivedDone = row.done_count;
      out.archivedOverdue = row.overdue_count;
    } else {
      out.activeOpen = row.open_count;
      out.activeDone = row.done_count;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const tenantId = await resolveTenantByAdmin(ADMIN_EMAIL);
  const session = await buildAdminSession(tenantId, ADMIN_EMAIL);
  const adminId = session.user_id;
  const memberId = await resolveUserId(tenantId, MEMBER_EMAIL);
  if (!memberId) {
    throw new Error(
      `No user ${MEMBER_EMAIL} in tenant ${tenantId}. Create it with ` +
        `\`MEMBER_COUNT=1 bash scripts/dev/tenant-bootstrap.sh\`, or point MEMBER_EMAIL at an existing non-admin user.`,
    );
  }

  if (RESET) await resetFixture(tenantId);

  let groupsCreated = 0;
  let tasksCreated = 0;
  for (const spec of FIXTURE) {
    const r = await seedGroup(spec, session, { admin: adminId, member: memberId });
    if (r.created) groupsCreated++;
    tasksCreated += r.tasks;
  }

  const admin = await rollupFor(tenantId, adminId);
  const member = await rollupFor(tenantId, memberId);

  log.info({ groupsCreated, tasksCreated }, 'planner archived-group fixture ready');
  log.info(
    {
      user: ADMIN_EMAIL,
      correct_open: admin.activeOpen,
      leaked_open: admin.archivedOpen,
      buggy_open_total: admin.activeOpen + admin.archivedOpen,
      completed_active: admin.activeDone,
      completed_archived: admin.archivedDone,
      leaked_overdue: admin.archivedOverdue,
    },
    'admin persona — planner_getOpenTaskCountForUser and planner_queryTasks should return correct_open',
  );
  log.info(
    {
      user: MEMBER_EMAIL,
      correct_open: member.activeOpen,
      leaked_open: member.archivedOpen,
      buggy_open_total: member.activeOpen + member.archivedOpen,
      completed_archived: member.archivedDone,
      leaked_overdue: member.archivedOverdue,
    },
    'member persona — every group is archived, so both the list and the count should say "no active groups"',
  );
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error({ err }, 'seed failed');
    await closePools();
    process.exit(1);
  });
