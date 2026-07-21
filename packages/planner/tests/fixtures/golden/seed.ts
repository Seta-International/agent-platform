// packages/planner/tests/fixtures/golden/seed.ts
import { slugifySkill } from '@seta/core';
import type { Pool } from 'pg';
import * as C from './constants.ts';
import { ALL_EVENTS } from './events.ts';
import { GROUPS, MEMBERSHIPS, ORG_UNITS } from './organization.ts';
import { ALL_PEOPLE, SKILL_CATALOG } from './people.ts';
import { BUCKETS, LABELS, PLANS } from './plans.ts';
import { ALL_COMMENTS, ALL_TASKS } from './tasks.ts';

/** Flattened skill catalog: every skill paired with its owning category id. */
interface FlatSkill {
  id: string;
  name: string;
  category_id: string;
}

const FLAT_SKILLS: FlatSkill[] = SKILL_CATALOG.flatMap((category) =>
  category.skills.map((skill) => ({ id: skill.id, name: skill.name, category_id: category.id })),
);

const SKILL_ID_BY_NAME: Map<string, string> = new Map(FLAT_SKILLS.map((s) => [s.name, s.id]));

/**
 * Seeds the full golden dataset (tenant, skill catalog, people, org units,
 * planner groups/plans/tasks, and events) into `pool` via raw SQL. Every
 * insert uses `ON CONFLICT DO NOTHING`, so this is safe to re-run against a
 * database that already has the fixture loaded — it is a one-shot eval
 * fixture seeder, not a migration, so it deliberately avoids retries,
 * transactions, or batching.
 */
export async function seedGoldenDataset(pool: Pool): Promise<void> {
  // 1. Tenant.
  await pool.query(
    `INSERT INTO core.tenants (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [C.TENANT_ID, C.TENANT_NAME, C.TENANT_SLUG],
  );

  // 2. Events-partition prerequisite. `core.events` is RANGE-partitioned by
  // month; the platform migration only pre-creates partitions for the
  // current month through +12 months ahead, so past months (this dataset's
  // events go back to roughly -2 months, per daysFromNow()) must be
  // backfilled here before step 15 inserts any event rows. Computed
  // dynamically (not hardcoded) since the dataset is date-relative to "now".
  const now = C.REFERENCE_TIME;
  for (const offset of [-3, -2, -1, 0]) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    await pool.query(`SELECT core.ensure_events_partition($1::date)`, [monthStart]);
  }

  // 3. Skill catalog.
  for (const category of SKILL_CATALOG) {
    await pool.query(
      `INSERT INTO core.skill_category (id, tenant_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [category.id, C.TENANT_ID, category.name],
    );
    for (const skill of category.skills) {
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name, slug)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [skill.id, C.TENANT_ID, category.id, skill.name, slugifySkill(skill.name)],
      );
    }
  }

  // 4. Org units.
  for (const unit of ORG_UNITS) {
    await pool.query(
      `INSERT INTO people.org_unit (id, tenant_id, name, kind, sort)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [unit.id, C.TENANT_ID, unit.name, unit.kind, unit.sort],
    );
  }

  // 5. People + user/assignee projections + person skills.
  for (let personIndex = 0; personIndex < ALL_PEOPLE.length; personIndex++) {
    const person = ALL_PEOPLE[personIndex]!;

    await pool.query(
      `INSERT INTO people.person
         (id, tenant_id, full_name, work_email, bio, availability_status, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        person.person_id,
        C.TENANT_ID,
        person.full_name,
        person.email,
        person.bio,
        person.availability_status,
        person.timezone,
      ],
    );

    await pool.query(
      `INSERT INTO people.user_projection (user_id, tenant_id, person_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [person.user_id, C.TENANT_ID, person.person_id],
    );

    await pool.query(
      `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        person.user_id,
        C.TENANT_ID,
        person.full_name,
        person.email,
        person.availability_status,
        person.timezone,
      ],
    );

    for (let skillIndex = 0; skillIndex < person.skills.length; skillIndex++) {
      const skill = person.skills[skillIndex]!;
      const skillId = SKILL_ID_BY_NAME.get(skill.skill_name);
      if (!skillId) {
        throw new Error(
          `seedGoldenDataset: unknown skill "${skill.skill_name}" on person "${person.full_name}" — not in SKILL_CATALOG`,
        );
      }
      await pool.query(
        `INSERT INTO people.person_skill (id, tenant_id, person_id, skill_id, skill_name, level)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          C.seededId('pskill0', personIndex * 10 + skillIndex),
          C.TENANT_ID,
          person.person_id,
          skillId,
          skill.skill_name,
          skill.level,
        ],
      );
    }
  }

  // 6. Groups.
  for (const group of GROUPS) {
    await pool.query(
      `INSERT INTO planner.groups (id, tenant_id, name, visibility, theme, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [group.id, C.TENANT_ID, group.name, group.visibility, group.theme, C.ADMIN_USER_ID],
    );
  }

  // 7. Group memberships.
  for (const membership of MEMBERSHIPS) {
    await pool.query(
      `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, group_id, user_id) DO NOTHING`,
      [C.TENANT_ID, membership.group_id, membership.user_id, membership.role, C.ADMIN_USER_ID],
    );
  }

  // 8. Plans.
  for (const plan of PLANS) {
    await pool.query(
      `INSERT INTO planner.plans (id, tenant_id, group_id, name, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [plan.id, C.TENANT_ID, plan.group_id, plan.name, C.ADMIN_USER_ID],
    );
  }

  // 9. Buckets.
  for (const bucket of BUCKETS) {
    await pool.query(
      `INSERT INTO planner.buckets (id, tenant_id, plan_id, name, order_hint, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [bucket.id, C.TENANT_ID, bucket.plan_id, bucket.name, bucket.order_hint, C.ADMIN_USER_ID],
    );
  }

  // 10. Labels.
  for (const label of LABELS) {
    await pool.query(
      `INSERT INTO planner.labels (id, tenant_id, plan_id, name, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [label.id, C.TENANT_ID, label.plan_id, label.name, label.color],
    );
  }

  // 11. Tasks.
  for (const task of ALL_TASKS) {
    await pool.query(
      `INSERT INTO planner.tasks
         (id, tenant_id, plan_id, bucket_id, title, description, priority, progress, due_at, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        C.TENANT_ID,
        task.plan_id,
        task.bucket_id,
        task.title,
        task.description,
        task.priority,
        task.progress,
        task.due_at,
        task.created_at,
        C.ADMIN_USER_ID,
      ],
    );
  }

  // 12. Task assignments.
  for (const task of ALL_TASKS) {
    for (const userId of task.assignee_user_ids) {
      await pool.query(
        `INSERT INTO planner.task_assignments (tenant_id, task_id, user_id, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (task_id, user_id) DO NOTHING`,
        [C.TENANT_ID, task.id, userId, C.ADMIN_USER_ID],
      );
    }
  }

  // 13. Task labels.
  for (const task of ALL_TASKS) {
    for (const labelId of task.label_ids) {
      await pool.query(
        `INSERT INTO planner.task_labels (tenant_id, task_id, label_id, applied_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, task_id, label_id) DO NOTHING`,
        [C.TENANT_ID, task.id, labelId, C.ADMIN_USER_ID],
      );
    }
  }

  // 14. Comments.
  for (const comment of ALL_COMMENTS) {
    await pool.query(
      `INSERT INTO planner.task_comments (id, tenant_id, task_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        comment.id,
        C.TENANT_ID,
        comment.task_id,
        comment.author_user_id,
        comment.body,
        comment.created_at,
      ],
    );
  }

  // 15. Events. Requires the partitions backfilled in step 2.
  for (const event of ALL_EVENTS) {
    await pool.query(
      `INSERT INTO core.events
         (id, occurred_at, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload, caused_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id, occurred_at) DO NOTHING`,
      [
        event.id,
        event.occurred_at,
        C.TENANT_ID,
        event.aggregate_type,
        event.aggregate_id,
        event.event_type,
        event.event_version,
        JSON.stringify(event.payload),
        event.caused_by_user_id,
      ],
    );
  }
}

/**
 * Deletes every row written by `seedGoldenDataset`, scoped to the golden
 * dataset's tenant (reverse FK order). Safe to call even if nothing was
 * seeded yet.
 */
export async function cleanGoldenDataset(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM core.events WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.task_comments WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.task_labels WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.task_assignments WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.tasks WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.labels WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.buckets WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.plans WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.group_members WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.groups WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM planner.assignee_projection WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM people.person_skill WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM people.user_projection WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM people.person WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM people.org_unit WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM core.skill WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM core.skill_category WHERE tenant_id = $1`, [C.TENANT_ID]);
  await pool.query(`DELETE FROM core.tenants WHERE id = $1`, [C.TENANT_ID]);
}
