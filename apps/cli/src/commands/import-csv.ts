import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { createUser, grantRole, listRoleGrants } from '@seta/identity';
import { addGroupMember, createGroup } from '@seta/planner';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { parseCsvs } from './lib/csv-parser.ts';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';

const log = pino({ name: 'cli/import-csv' });

const KNOWN_ROLES = new Set(['org.admin', 'planner.contributor', 'planner.viewer']);

export interface ImportCsvOpts {
  tenant: string;
  dir: string;
  as: string;
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

export async function importCsvCommand(opts: ImportCsvOpts): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  const session = await buildAdminSession(tenantId, opts.as);

  // Phase 1 — Parse all CSVs
  log.info({ dir: opts.dir }, 'phase 1: parsing CSVs');
  const csvs = parseCsvs(opts.dir);

  // Phase 2 — Create users
  log.info('phase 2: creating users');
  const idMap = new Map<string, string>(); // csvId → db uuid
  let usersCreated = 0;
  let usersSkipped = 0;

  for (const row of csvs.users) {
    try {
      const { user_id } = await createUser(
        {
          tenant_id: tenantId,
          email: row.email,
          name: row.name,
          password: crypto.randomUUID(),
        },
        { type: 'cli', user_id: null },
      );
      idMap.set(row.user_id, user_id);
      usersCreated++;

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
      log.warn({ csv_user_id: row.user_id, email: row.email, err }, 'createUser failed, skipping');
      usersSkipped++;
    }
  }
  process.stdout.write(
    `${JSON.stringify({ phase: 'users', created: usersCreated, skipped: usersSkipped })}\n`,
  );

  // Phase 3 — Create SETA Future group
  log.info('phase 3: creating group');
  const group = await createGroup({ tenant_id: tenantId, name: 'SETA Future', session });
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
}
