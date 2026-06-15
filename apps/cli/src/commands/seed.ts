import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { createUser, grantRole, listRoleGrants, updateUserProfile } from '@seta/identity';
import {
  addGroupMember,
  applyLabelsByName,
  assignTask,
  createBucket,
  createGroup,
  createPlan,
  createTask,
  listBuckets,
  listGroups,
  listPlans,
  listTasks,
} from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { mapPriorityNumber, mapStatusFields, parseCsvs, splitIds } from './lib/csv-parser.ts';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';
import { tenantCreateCommand } from './tenant-create.ts';

const log = pino({ name: 'cli/seed' });

const KNOWN_ROLES = new Set([
  'org.admin',
  'planner.admin',
  'planner.contributor',
  'planner.viewer',
]);
const VALID_GROUP_THEMES = new Set(['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red']);
type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
function coerceGroupTheme(raw: string): GroupTheme {
  return VALID_GROUP_THEMES.has(raw) ? (raw as GroupTheme) : 'blue';
}

export interface SeedOpts {
  tenant: string;
  tenantName?: string;
  dir: string;
  adminEmail: string;
  adminName?: string;
  password?: string;
  only?: string;
}

async function resolveTenantIdOrNull(input: string): Promise<string | null> {
  try {
    return await resolveTenantId(input);
  } catch {
    return null;
  }
}

type Module = 'users' | 'planner' | 'availability';
const ALL_MODULES: Module[] = ['users', 'planner', 'availability'];

function parseModules(only: string | undefined): Set<Module> {
  if (!only) return new Set(ALL_MODULES);
  const requested = only
    .split(',')
    .map((m) => m.trim())
    .filter((m): m is Module => (ALL_MODULES as string[]).includes(m));
  if (requested.length === 0) return new Set(ALL_MODULES);
  return new Set(requested);
}

async function resolveUserIdByEmail(tenantId: string, email: string): Promise<string> {
  if (UUID_RE.test(email)) return email;
  const row = await coreDb().execute(sql`
    SELECT id FROM identity."user"
    WHERE tenant_id = ${tenantId} AND lower(email) = lower(${email})
    LIMIT 1
  `);
  const id = (row.rows[0] as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`No user with email ${email} in tenant ${tenantId}`);
  return id;
}

const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));

async function buildAdminSession(tenantId: string, adminEmail: string): Promise<SessionScope> {
  const userId = await resolveUserIdByEmail(tenantId, adminEmail);
  const { grants } = await listRoleGrants(userId);
  const role_summary = rollup(grants);
  return {
    session_id: `cli-import-${userId}`,
    user_id: userId,
    tenant_id: tenantId,
    email: adminEmail,
    display_name: adminEmail,
    role_summary,
    permissions: resolvePermissions(rbacRegistry, role_summary.roles, IMPLICIT_PERMISSIONS),
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(grants),
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export async function seedCommand(opts: SeedOpts): Promise<void> {
  const password = opts.password ?? 'ChangeMe@2026';

  // Auto-create tenant + admin if the slug doesn't resolve. UUIDs are treated as
  // pre-existing — we only bootstrap when a fresh slug is supplied.
  let tenantId = await resolveTenantIdOrNull(opts.tenant);
  if (!tenantId) {
    if (UUID_RE.test(opts.tenant)) {
      throw new Error(`Tenant ${opts.tenant} not found and cannot be created from a UUID`);
    }
    const tenantName =
      opts.tenantName ?? (opts.tenant === 'hackathon' ? 'Seta Hackathon' : opts.tenant);
    log.info(
      { slug: opts.tenant, name: tenantName, admin: opts.adminEmail },
      'tenant missing, creating',
    );
    await tenantCreateCommand({
      name: tenantName,
      slug: opts.tenant,
      adminEmail: opts.adminEmail,
      adminName: opts.adminName,
      adminPassword: password,
    });
    tenantId = await resolveTenantId(opts.tenant);
  }

  const session = await buildAdminSession(tenantId, opts.adminEmail);
  const modules = parseModules(opts.only);

  // Phase 1 — Parse all CSVs
  log.info({ dir: opts.dir }, 'phase 1: parsing CSVs');
  const csvs = parseCsvs(opts.dir);

  // Phase 2 — Create users (or resolve existing when users module is skipped)
  const idMap = new Map<string, string>(); // csvId → db uuid
  if (modules.has('users')) {
    log.info('phase 2a: creating users');
    let usersCreated = 0;
    let usersReused = 0;
    let usersSkipped = 0;

    for (const row of csvs.users) {
      // Resolve or create the DB user. The profile + role grant steps run
      // regardless so previously-bootstrapped users (e.g. the admin) still
      // pick up bio/timezone/working_hours from the CSV.
      let user_id: string;
      try {
        const created = await createUser(
          { tenant_id: tenantId, email: row.email, name: row.name, password },
          { type: 'cli', user_id: null },
        );
        user_id = created.user_id;
        usersCreated++;
      } catch {
        try {
          user_id = await resolveUserIdByEmail(tenantId, row.email);
        } catch (err) {
          log.warn(
            { csv_user_id: row.user_id, email: row.email, err },
            'createUser failed and no existing user, skipping',
          );
          usersSkipped++;
          continue;
        }
        usersReused++;
      }
      idMap.set(row.user_id, user_id);

      if (row.rbac_role && KNOWN_ROLES.has(row.rbac_role)) {
        try {
          await grantRole(
            {
              user_id,
              tenant_id: tenantId,
              role_slug: row.rbac_role,
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'cli', user_id: null },
          );
        } catch {
          // Already granted — idempotent skip
        }
      } else if (row.rbac_role) {
        log.warn(
          { csv_user_id: row.user_id, rbac_role: row.rbac_role },
          'unknown role slug, skipping grant',
        );
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'users', created: usersCreated, reused: usersReused, skipped: usersSkipped })}\n`,
    );

    // Phase 2b — Update profiles in a separate pass so all identity.user.created
    // events are emitted before any identity.user.profile.updated events. This
    // prevents the planner assignee-projection subscriber from racing: if profile
    // events arrive before the user.created subscriber has inserted the projection
    // row, the UPDATE is a no-op and skills are silently lost.
    log.info('phase 2b: updating user profiles');
    for (const row of csvs.users) {
      const user_id = idMap.get(row.user_id);
      if (!user_id) continue;

      const skills = splitIds(row.skills);
      const workingHours =
        row.working_hours_start && row.working_hours_end
          ? { start: row.working_hours_start, end: row.working_hours_end }
          : null;
      const availability =
        row.availability_status === 'available' ||
        row.availability_status === 'busy' ||
        row.availability_status === 'ooo'
          ? row.availability_status
          : undefined;
      try {
        await updateUserProfile(
          user_id,
          {
            skills: skills.length > 0 ? skills : undefined,
            role: row.role || null,
            bio: row.bio ? row.bio : null,
            timezone: row.timezone || undefined,
            working_hours: workingHours,
            availability_status: availability,
          },
          { type: 'cli', user_id: null },
        );
      } catch (err) {
        log.warn({ csv_user_id: row.user_id, err }, 'updateUserProfile failed');
      }
    }
  } else {
    // Resolve existing users so later phases can map CSV IDs to DB UUIDs.
    log.info('phase 2: resolving existing users (users module skipped)');
    for (const row of csvs.users) {
      try {
        const existingId = await resolveUserIdByEmail(tenantId, row.email);
        idMap.set(row.user_id, existingId);
      } catch {
        // user not yet in DB, skip silently
      }
    }
    process.stdout.write(`${JSON.stringify({ phase: 'users', skipped: true })}\n`);
  }

  if (!modules.has('planner')) {
    process.stdout.write(`${JSON.stringify({ phase: 'planner', skipped: true })}\n`);
  } else {
    // Phase 3 — Create groups from groups.csv (idempotent: reuse existing by name)
    log.info('phase 3: creating groups');
    const existingGroups = await listGroups({ session });
    const existingByName = new Map(existingGroups.map((g) => [g.name, g]));
    const groupMap = new Map<string, string>(); // csvGroupId → db uuid
    let groupsCreated = 0;
    let groupsReused = 0;
    const groupsSkipped = 0;

    for (const row of csvs.groups) {
      const existing = existingByName.get(row.name);
      if (existing) {
        groupMap.set(row.group_id, existing.id);
        groupsReused++;
        continue;
      }
      try {
        const group = await createGroup({
          tenant_id: tenantId,
          name: row.name,
          description: row.description || undefined,
          theme: coerceGroupTheme(row.theme),
          session,
        });
        groupMap.set(row.group_id, group.id);
        groupsCreated++;
      } catch (err) {
        log.warn({ csv_group_id: row.group_id, name: row.name, err }, 'createGroup failed');
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'groups', created: groupsCreated, reused: groupsReused, skipped: groupsSkipped })}\n`,
    );

    // Phase 4 — Add group members by deriving (group → users) from plans + plan_members.
    // A user joins every group whose plans they're a member of.
    log.info('phase 4: adding group members');
    const planToGroup = new Map<string, string>(); // csvPlanId → csvGroupId
    for (const p of csvs.plans) {
      if (p.group_id) planToGroup.set(p.plan_id, p.group_id);
    }
    const groupMembers = new Map<string, Set<string>>(); // csvGroupId → set of csvUserIds
    for (const m of csvs.planMembers) {
      const gid = planToGroup.get(m.plan_id);
      if (!gid) continue;
      if (!groupMembers.has(gid)) groupMembers.set(gid, new Set());
      groupMembers.get(gid)?.add(m.member_id);
    }

    let membersAdded = 0;
    let membersReused = 0;
    let membersSkipped = 0;
    for (const [csvGroupId, members] of groupMembers) {
      const dbGroupId = groupMap.get(csvGroupId);
      if (!dbGroupId) {
        log.warn({ csv_group_id: csvGroupId }, 'group not created, skipping member adds');
        continue;
      }
      for (const csvUserId of members) {
        const userId = idMap.get(csvUserId);
        if (!userId) {
          membersSkipped++;
          continue;
        }
        try {
          await addGroupMember({ group_id: dbGroupId, user_id: userId, session });
          membersAdded++;
        } catch {
          // Already a member — idempotent skip
          membersReused++;
        }
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'members', added: membersAdded, reused: membersReused, skipped: membersSkipped })}\n`,
    );

    // Phase 5 — Create plans under their assigned group (idempotent: reuse existing by name+group)
    log.info('phase 5: creating plans');
    const planMap = new Map<string, string>(); // csvPlanId → db uuid
    let plansCreated = 0;
    let plansReused = 0;
    let plansSkipped = 0;

    // Pre-load all existing plans so we can match by name without N+1 queries.
    const allExistingPlans = await listPlans({ session });
    // Key: `${groupId}::${name}` → plan id
    const existingPlansByKey = new Map(
      allExistingPlans.map((p) => [`${p.group_id}::${p.name}`, p.id]),
    );

    for (const row of csvs.plans) {
      const dbGroupId = groupMap.get(row.group_id);
      if (!dbGroupId) {
        log.warn(
          { csv_plan_id: row.plan_id, csv_group_id: row.group_id },
          'plan group not found, skipping plan',
        );
        plansSkipped++;
        continue;
      }
      const planName = row.title || 'Untitled Plan';
      const existingPlanId = existingPlansByKey.get(`${dbGroupId}::${planName}`);
      if (existingPlanId) {
        planMap.set(row.plan_id, existingPlanId);
        plansReused++;
        continue;
      }
      try {
        const plan = await createPlan({ group_id: dbGroupId, name: planName, session });
        planMap.set(row.plan_id, plan.id);
        existingPlansByKey.set(`${dbGroupId}::${planName}`, plan.id);
        plansCreated++;
      } catch (err) {
        log.warn({ csv_plan_id: row.plan_id, err }, 'createPlan failed, skipping');
        plansSkipped++;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'plans', created: plansCreated, reused: plansReused, skipped: plansSkipped })}\n`,
    );

    // Phase 6 — Create buckets (idempotent: reuse existing by name+plan)
    log.info('phase 6: creating buckets');
    const bucketMap = new Map<string, string>(); // csvBucketId → db uuid
    let bucketsCreated = 0;
    let bucketsReused = 0;
    let bucketsSkipped = 0;

    // Pre-load buckets for every plan we created/reused.
    const existingBucketsByKey = new Map<string, string>(); // `${planId}::${name}` → bucket id
    for (const planId of new Set(planMap.values())) {
      try {
        const existing = await listBuckets({ plan_id: planId, session });
        for (const b of existing) existingBucketsByKey.set(`${planId}::${b.name}`, b.id);
      } catch {
        // plan may have been skipped — ignore
      }
    }

    for (const row of csvs.buckets) {
      const planId = planMap.get(row.plan_id);
      if (!planId) {
        log.warn(
          { csv_bucket_id: row.bucket_id, csv_plan_id: row.plan_id },
          'plan not found, skipping bucket',
        );
        bucketsSkipped++;
        continue;
      }
      const existingBucketId = existingBucketsByKey.get(`${planId}::${row.name}`);
      if (existingBucketId) {
        bucketMap.set(row.bucket_id, existingBucketId);
        bucketsReused++;
        continue;
      }
      try {
        const bucket = await createBucket({ plan_id: planId, name: row.name, session });
        bucketMap.set(row.bucket_id, bucket.id);
        existingBucketsByKey.set(`${planId}::${row.name}`, bucket.id);
        bucketsCreated++;
      } catch (err) {
        log.warn({ csv_bucket_id: row.bucket_id, err }, 'createBucket failed, skipping');
        bucketsSkipped++;
      }
    }
    process.stdout.write(
      `${JSON.stringify({
        phase: 'buckets',
        created: bucketsCreated,
        reused: bucketsReused,
        skipped: bucketsSkipped,
      })}\n`,
    );

    // Phase 7 — Create tasks and assignments (idempotent: reuse existing by title+plan)
    log.info('phase 7: creating tasks');
    let tasksCreated = 0;
    let tasksReused = 0;
    let assignmentsCreated = 0;
    let tasksSkipped = 0;

    // Pre-load tasks for every plan we created/reused.
    const existingTasksByKey = new Map<string, string>(); // `${planId}::${title}` → task id
    for (const planId of new Set(planMap.values())) {
      try {
        const { tasks: existing } = await listTasks({ filters: { plan_id: planId }, session });
        for (const t of existing) existingTasksByKey.set(`${planId}::${t.title}`, t.id);
      } catch {
        // plan may have been skipped — ignore
      }
    }

    for (const row of csvs.tasks) {
      const planId = planMap.get(row.plan_id);
      if (!planId) {
        log.warn(
          { csv_task_id: row.task_id, csv_plan_id: row.plan_id },
          'plan not found, skipping task',
        );
        tasksSkipped++;
        continue;
      }

      const taskTitle = row.title || 'Untitled';
      const existingTaskId = existingTasksByKey.get(`${planId}::${taskTitle}`);
      if (existingTaskId) {
        tasksReused++;
        continue;
      }

      const bucketId = bucketMap.get(row.bucket_id) ?? undefined;
      const labelNames = splitIds(row.tags);

      const statusFields = mapStatusFields(row.status);
      const task = await createTask({
        plan_id: planId,
        bucket_id: bucketId,
        title: taskTitle,
        description: row.description || undefined,
        priority_number: mapPriorityNumber(row.priority),
        percent_complete: statusFields.percent_complete,
        is_deferred: statusFields.is_deferred,
        due_at: row.due_date || undefined,
        session,
      });
      tasksCreated++;

      // Skills are modeled as labels: find-or-create per plan, then apply.
      if (labelNames.length > 0) {
        await applyLabelsByName({ plan_id: planId, task_id: task.id, names: labelNames, session });
      }

      for (const csvId of splitIds(row.assignee_ids)) {
        const userId = idMap.get(csvId);
        if (!userId) {
          log.warn(
            { csv_task_id: row.task_id, csv_assignee_id: csvId },
            'assignee not in users.csv, skipping',
          );
          continue;
        }
        try {
          await assignTask({ task_id: task.id, user_id: userId, session });
          assignmentsCreated++;
        } catch (err) {
          log.warn(
            { csv_task_id: row.task_id, csv_assignee_id: csvId, err },
            'assignTask failed, skipping',
          );
        }
      }
    }
    process.stdout.write(
      `${JSON.stringify({
        phase: 'tasks',
        created: tasksCreated,
        reused: tasksReused,
        assignments: assignmentsCreated,
        skipped: tasksSkipped,
      })}\n`,
    );
  }

  if (!modules.has('availability')) {
    process.stdout.write(`${JSON.stringify({ phase: 'availability', skipped: true })}\n`);
  } else {
    // Phase 8 — Update user availability from timesheet
    log.info('phase 8: updating availability');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect the furthest ooo_until per user among active approved leaves
    const oooMap = new Map<string, Date>(); // csvUserId → furthest end_date

    for (const row of csvs.timesheet) {
      if (row.status !== 'approved') continue;
      const start = new Date(row.start_date);
      const end = new Date(row.end_date);
      if (start > today || end < today) continue;
      const existing = oooMap.get(row.employee_id);
      if (!existing || end > existing) {
        oooMap.set(row.employee_id, end);
      }
    }

    let availabilityUpdated = 0;
    let availabilitySkipped = 0;

    for (const [csvId, oooUntil] of oooMap) {
      const userId = idMap.get(csvId);
      if (!userId) {
        log.warn({ csv_employee_id: csvId }, 'timesheet employee not in users.csv, skipping');
        availabilitySkipped++;
        continue;
      }
      await updateUserProfile(
        userId,
        { availability_status: 'ooo', ooo_until: oooUntil },
        { type: 'cli', user_id: null },
      );
      availabilityUpdated++;
    }
    process.stdout.write(
      `${JSON.stringify({
        phase: 'availability',
        updated: availabilityUpdated,
        skipped: availabilitySkipped,
      })}\n`,
    );
  }

  log.info({ tenant_id: tenantId, modules: [...modules] }, 'seed: complete');
}
