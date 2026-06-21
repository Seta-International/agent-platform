import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { listRoleGrants } from '@seta/identity';
import { createWorker } from '@seta/people';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { parse } from 'csv-parse/sync';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { resolveTenantId, UUID_RE } from './lib/tenant-resolve.ts';
import { tenantCreateCommand } from './tenant-create.ts';

const log = pino({ name: 'cli/seed' });

export interface SeedOpts {
  tenant: string;
  tenantName?: string;
  dir: string;
  adminEmail: string;
  adminName?: string;
  password?: string;
}

interface EmployeeCsvRow {
  full_name: string;
  work_email: string;
  employment_type: string;
}

async function resolveTenantIdOrNull(input: string): Promise<string | null> {
  try {
    return await resolveTenantId(input);
  } catch {
    return null;
  }
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

export async function buildAdminSession(
  tenantId: string,
  adminEmail: string,
): Promise<SessionScope> {
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

function parseEmployees(dir: string): EmployeeCsvRow[] | null {
  const path = join(dir, 'employees.csv');
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as EmployeeCsvRow[];
}

async function workerExistsByEmail(tenantId: string, workEmail: string): Promise<boolean> {
  const row = await coreDb().execute(sql`
    SELECT 1 FROM people.worker
    WHERE tenant_id = ${tenantId} AND lower(work_email) = lower(${workEmail})
      AND deleted_at IS NULL
    LIMIT 1
  `);
  return row.rows.length > 0;
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
    const tenantName = opts.tenantName ?? opts.tenant;
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

  const employees = parseEmployees(opts.dir);
  if (!employees) {
    log.warn(
      { dir: opts.dir },
      'employees.csv absent (gitignored PII file) — seeded tenant + admin only, no People workers',
    );
    process.stdout.write(`${JSON.stringify({ phase: 'workers', skipped: 'no-data-file' })}\n`);
    log.info({ tenant_id: tenantId }, 'seed: complete');
    return;
  }

  log.info({ dir: opts.dir, count: employees.length }, 'seeding People workers');
  let created = 0;
  let reused = 0;
  let skipped = 0;
  for (const row of employees) {
    if (!row.full_name?.trim()) {
      skipped++;
      continue;
    }
    const workEmail = row.work_email?.trim() || undefined;
    if (workEmail && (await workerExistsByEmail(tenantId, workEmail))) {
      reused++;
      continue;
    }
    try {
      await createWorker({
        full_name: row.full_name.trim(),
        work_email: workEmail,
        employment_type: row.employment_type?.trim() || undefined,
        session,
      });
      created++;
    } catch (err) {
      log.warn({ full_name: row.full_name, work_email: workEmail, err }, 'createWorker failed');
      skipped++;
    }
  }
  process.stdout.write(`${JSON.stringify({ phase: 'workers', created, reused, skipped })}\n`);

  log.info({ tenant_id: tenantId }, 'seed: complete');
}
