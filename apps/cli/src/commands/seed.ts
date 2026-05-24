import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { createUser, grantRole, listRoleGrants, updateUserProfile } from '@seta/identity';
import {
  addGroupMember,
  assignTask,
  createBucket,
  createGroup,
  createPlan,
  createTask,
  listGroups,
} from '@seta/planner';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { mapPriorityNumber, mapStatusFields, parseCsvs, splitIds } from './lib/csv-parser.ts';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';
import { tenantCreateCommand } from './tenant-create.ts';

const log = pino({ name: 'cli/seed' });

const KNOWN_ROLES = new Set(['org.admin', 'planner.contributor', 'planner.viewer']);

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
      opts.tenantName ?? (opts.tenant === 'setafutureorg' ? 'SETA Future Org' : opts.tenant);
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
    log.info('phase 2: creating users');
    let usersCreated = 0;
    let usersSkipped = 0;

    for (const row of csvs.users) {
      try {
        const { user_id } = await createUser(
          { tenant_id: tenantId, email: row.email, name: row.name, password },
          { type: 'cli', user_id: null },
        );
        idMap.set(row.user_id, user_id);
        usersCreated++;

        const skills = splitIds(row.skills);
        await updateUserProfile(
          user_id,
          {
            skills: skills.length > 0 ? skills : undefined,
            role: row.role || null,
          },
          { type: 'cli', user_id: null },
        );

        if (row.rbac_role && KNOWN_ROLES.has(row.rbac_role)) {
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
        } else if (row.rbac_role) {
          log.warn(
            { csv_user_id: row.user_id, rbac_role: row.rbac_role },
            'unknown role slug, skipping grant',
          );
        }
      } catch (err) {
        // User may already exist — look up existing UUID so assignee links still work.
        try {
          const existingId = await resolveUserIdByEmail(tenantId, row.email);
          idMap.set(row.user_id, existingId);
        } catch {
          log.warn(
            { csv_user_id: row.user_id, email: row.email, err },
            'createUser failed, skipping',
          );
        }
        usersSkipped++;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'users', created: usersCreated, skipped: usersSkipped })}\n`,
    );
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
    // Phase 3 — Create SETA Future group (idempotent: reuse existing if name already taken)
    log.info('phase 3: creating group');
    let group: { id: string; name: string };
    try {
      group = await createGroup({ tenant_id: tenantId, name: 'SETA Future', session });
    } catch {
      const existing = (await listGroups({ session })).find((g) => g.name === 'SETA Future');
      if (!existing) throw new Error('createGroup failed and "SETA Future" group not found');
      group = existing;
      log.info({ group_id: existing.id }, 'phase 3: reusing existing group');
    }
    process.stdout.write(`${JSON.stringify({ phase: 'group', id: group.id, name: group.name })}\n`);

    // Phase 4 — Add group members (deduplicated union of all plan_members)
    log.info('phase 4: adding group members');
    const uniqueMemberCsvIds = [...new Set(csvs.planMembers.map((r) => r.member_id))];
    let membersAdded = 0;
    let membersSkipped = 0;

    for (const csvId of uniqueMemberCsvIds) {
      const userId = idMap.get(csvId);
      if (!userId) {
        log.warn({ csv_member_id: csvId }, 'member not in users.csv, skipping');
        membersSkipped++;
        continue;
      }
      try {
        await addGroupMember({ group_id: group.id, user_id: userId, session });
        membersAdded++;
      } catch (err) {
        log.warn({ csv_member_id: csvId, err }, 'addGroupMember failed, skipping');
        membersSkipped++;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'members', added: membersAdded, skipped: membersSkipped })}\n`,
    );

    // Phase 5 — Create plans
    log.info('phase 5: creating plans');
    const planMap = new Map<string, string>(); // csvPlanId → db uuid
    let plansCreated = 0;
    let plansSkipped = 0;

    for (const row of csvs.plans) {
      try {
        const plan = await createPlan({
          group_id: group.id,
          name: row.title || 'Untitled Plan',
          session,
        });
        planMap.set(row.plan_id, plan.id);
        plansCreated++;
      } catch (err) {
        log.warn({ csv_plan_id: row.plan_id, err }, 'createPlan failed, skipping');
        plansSkipped++;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ phase: 'plans', created: plansCreated, skipped: plansSkipped })}\n`,
    );

    // Phase 6 — Create buckets (CSV order = sort_order via createBucket's append logic)
    log.info('phase 6: creating buckets');
    const bucketMap = new Map<string, string>(); // csvBucketId → db uuid
    let bucketsCreated = 0;
    let bucketsSkipped = 0;

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
      try {
        const bucket = await createBucket({ plan_id: planId, name: row.name, session });
        bucketMap.set(row.bucket_id, bucket.id);
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
        skipped: bucketsSkipped,
      })}\n`,
    );

    // Phase 7 — Create tasks and assignments
    log.info('phase 7: creating tasks');
    let tasksCreated = 0;
    let assignmentsCreated = 0;
    let tasksSkipped = 0;

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

      const bucketId = bucketMap.get(row.bucket_id) ?? undefined;
      const skill_tags = splitIds(row.tags);

      const statusFields = mapStatusFields(row.status);
      const task = await createTask({
        plan_id: planId,
        bucket_id: bucketId,
        title: row.title || 'Untitled',
        description: row.description || undefined,
        priority_number: mapPriorityNumber(row.priority),
        percent_complete: statusFields.percent_complete,
        is_deferred: statusFields.is_deferred,
        due_at: row.due_date || undefined,
        skill_tags: skill_tags.length > 0 ? skill_tags : undefined,
        session,
      });
      tasksCreated++;

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
