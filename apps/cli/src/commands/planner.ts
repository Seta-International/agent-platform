import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { listRoleGrants } from '@seta/identity';
import {
  addGroupMember,
  assignTask,
  createBucket,
  createGroup,
  createPlan,
  createTask,
} from '@seta/planner';
import type { Command } from 'commander';
import { sql } from 'drizzle-orm';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';

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

async function buildActorSession(tenantId: string, actorEmail: string): Promise<SessionScope> {
  const userId = await resolveUserIdByEmail(tenantId, actorEmail);
  const { grants } = await listRoleGrants(userId);
  const role_summary = rollup(grants);
  return {
    session_id: `cli-${userId}`,
    user_id: userId,
    tenant_id: tenantId,
    email: actorEmail,
    display_name: actorEmail,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(grants),
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}

async function resolveGroupTenantId(groupId: string): Promise<string> {
  const row = await coreDb().execute(sql`
    SELECT tenant_id FROM planner.groups WHERE id = ${groupId} LIMIT 1
  `);
  const tenantId = (row.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  if (!tenantId) throw new Error(`No group with id ${groupId}`);
  return tenantId;
}

async function resolvePlanGroupTenantId(
  planId: string,
): Promise<{ tenantId: string; groupId: string }> {
  const row = await coreDb().execute(sql`
    SELECT tenant_id, group_id FROM planner.plans WHERE id = ${planId} LIMIT 1
  `);
  const r = row.rows[0] as { tenant_id?: string; group_id?: string } | undefined;
  if (!r?.tenant_id || !r.group_id) throw new Error(`No plan with id ${planId}`);
  return { tenantId: r.tenant_id, groupId: r.group_id };
}

export function plannerCommand(program: Command): void {
  const planner = program.command('planner').description('Planner commands');

  planner
    .command('group-create')
    .requiredOption('--tenant <slug>', 'Tenant slug or UUID')
    .requiredOption('--name <name>', 'Group name')
    .requiredOption('--as <email>', 'Actor user email')
    .action(async (opts: { tenant: string; name: string; as: string }) => {
      const tenantId = await resolveTenantId(opts.tenant);
      const session = await buildActorSession(tenantId, opts.as);
      const g = await createGroup({ tenant_id: tenantId, name: opts.name, session });
      process.stdout.write(`${JSON.stringify(g, null, 2)}\n`);
    });

  planner
    .command('group-add-member')
    .requiredOption('--group <id>', 'Group UUID')
    .requiredOption('--user <email>', 'User email to add')
    .requiredOption('--as <email>', 'Actor user email')
    .action(async (opts: { group: string; user: string; as: string }) => {
      const tenantId = await resolveGroupTenantId(opts.group);
      const session = await buildActorSession(tenantId, opts.as);
      const userId = await resolveUserIdByEmail(tenantId, opts.user);
      await addGroupMember({ group_id: opts.group, user_id: userId, session });
      process.stdout.write(`${JSON.stringify({ group_id: opts.group, user_id: userId })}\n`);
    });

  planner
    .command('plan-create')
    .requiredOption('--group <id>', 'Group UUID')
    .requiredOption('--name <name>', 'Plan name')
    .requiredOption('--as <email>', 'Actor user email')
    .action(async (opts: { group: string; name: string; as: string }) => {
      const tenantId = await resolveGroupTenantId(opts.group);
      const session = await buildActorSession(tenantId, opts.as);
      const p = await createPlan({ group_id: opts.group, name: opts.name, session });
      process.stdout.write(`${JSON.stringify(p, null, 2)}\n`);
    });

  planner
    .command('bucket-create')
    .requiredOption('--plan <id>', 'Plan UUID')
    .requiredOption('--name <name>', 'Bucket name')
    .requiredOption('--as <email>', 'Actor user email')
    .action(async (opts: { plan: string; name: string; as: string }) => {
      const { tenantId } = await resolvePlanGroupTenantId(opts.plan);
      const session = await buildActorSession(tenantId, opts.as);
      const b = await createBucket({ plan_id: opts.plan, name: opts.name, session });
      process.stdout.write(`${JSON.stringify(b, null, 2)}\n`);
    });

  planner
    .command('task-create')
    .requiredOption('--plan <id>', 'Plan UUID')
    .requiredOption('--title <title>', 'Task title')
    .option('--bucket <id>', 'Bucket UUID')
    .option('--assign <email>', 'Assignee user email')
    .option('--due <iso>', 'Due date (ISO 8601)')
    .requiredOption('--as <email>', 'Actor user email')
    .action(
      async (opts: {
        plan: string;
        title: string;
        bucket?: string;
        assign?: string;
        due?: string;
        as: string;
      }) => {
        const { tenantId } = await resolvePlanGroupTenantId(opts.plan);
        const session = await buildActorSession(tenantId, opts.as);
        const task = await createTask({
          plan_id: opts.plan,
          title: opts.title,
          bucket_id: opts.bucket,
          due_at: opts.due,
          session,
        });
        if (opts.assign) {
          const assigneeId = await resolveUserIdByEmail(tenantId, opts.assign);
          await assignTask({ task_id: task.id, user_id: assigneeId, session });
        }
        process.stdout.write(`${JSON.stringify(task, null, 2)}\n`);
      },
    );
}
