import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { seedTenant } from '../helpers.ts';

export interface SeedTaskOptions {
  tenant_id?: string; // when omitted, a fresh tenant is seeded
  pool?: Pool; // required when tenant_id is provided; otherwise inferred
  title: string;
  description: string | null;
  skill_tags: string[];
  soft_deleted?: boolean;
}

export interface SeededTask {
  tenant_id: string;
  task_id: string;
  plan_id: string;
  bucket_id: string;
}

/**
 * Seed a single task for embedding/retrieval tests via raw SQL (no RBAC overhead).
 *
 * If `tenant_id` is omitted a fresh tenant (+ admin user) is created via seedTenant.
 * In that case `pool` is required and is used for the scaffolding inserts.
 *
 * Returns the ids needed to assert against planner.task_embeddings.
 */
export async function seedTaskForTest(pool: Pool, opts: SeedTaskOptions): Promise<SeededTask> {
  let tenant_id: string;

  if (opts.tenant_id) {
    tenant_id = opts.tenant_id;
  } else {
    const seeded = await seedTenant(pool);
    tenant_id = seeded.tenant_id;
  }

  // Synthetic actor UUID — groups.created_by and plans.created_by are NOT NULL.
  // No FK constraint on these columns, so a random UUID is safe for test fixtures.
  const actor_id = randomUUID();

  // Insert group
  const group_id = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by, deleted_at)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4, NULL)`,
    [group_id, tenant_id, `Group ${group_id.slice(0, 8)}`, actor_id],
  );

  // Insert plan
  const plan_id = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans
       (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [plan_id, tenant_id, group_id, `Plan ${plan_id.slice(0, 8)}`, actor_id],
  );

  // Insert bucket
  const bucket_id = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets
       (id, tenant_id, plan_id, name, external_source)
     VALUES ($1, $2, $3, $4, 'native')`,
    [bucket_id, tenant_id, plan_id, `Bucket ${bucket_id.slice(0, 8)}`],
  );

  // Insert task — created_by is NOT NULL; use a synthetic UUID (no FK constraint on tasks).
  const task_id = randomUUID();
  const created_by = randomUUID();
  const deletedAt = opts.soft_deleted ? 'now()' : 'NULL';
  await pool.query(
    `INSERT INTO planner.tasks
       (id, tenant_id, plan_id, bucket_id, title, description, skill_tags, created_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${deletedAt})`,
    [
      task_id,
      tenant_id,
      plan_id,
      bucket_id,
      opts.title,
      opts.description,
      opts.skill_tags,
      created_by,
    ],
  );

  return { tenant_id, task_id, plan_id, bucket_id };
}
