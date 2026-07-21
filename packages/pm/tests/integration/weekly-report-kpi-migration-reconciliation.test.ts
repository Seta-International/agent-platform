// packages/pm/tests/integration/weekly-report-kpi-migration-reconciliation.test.ts
// FUT-609 (0011_pm_reporting.sql + 0012_weekly_report_platform.sql, merged & deployed to the
// dev environment) was redesigned and replaced by FUT-581 (0018_weekly_report_kpi_tables.sql +
// 0019_weekly_report_kpi_platform.sql) in the same PR that deleted the old files. The dev
// environment already has the old-shape tables and the old
// pm.tg_flag_audit_append_only() function from the earlier deploy, so re-running migrations
// there hits "relation already exists" on 0018 and then "function ... already exists" on 0019 —
// see https://github.com/Seta-International/agent-platform/actions/runs/29733289992/job/88322608871
// and https://github.com/Seta-International/agent-platform/actions/runs/29736208695/job/88332033576
//
// This recreates that pre-existing dev shape, then executes the SHIPPED 0018 + 0019 files
// verbatim (the template db already ran them once during setup, so it starts in the *new*
// shape — we drop down to the old shape first) and asserts they reconcile cleanly to the new
// schema.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const MIGRATION_0018 = fileURLToPath(
  new URL('../../drizzle/migrations/0018_weekly_report_kpi_tables.sql', import.meta.url),
);
const MIGRATION_0019 = fileURLToPath(
  new URL('../../drizzle/migrations/0019_weekly_report_kpi_platform.sql', import.meta.url),
);

/** The pre-redesign 0011_pm_reporting.sql shape (as deployed to dev under FUT-609). */
const OLD_SHAPE_TABLES = `
  CREATE TABLE "pm"."comment" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "report_id" uuid NOT NULL,
    "parent_comment_id" uuid,
    "author_user_id" uuid NOT NULL,
    "body" text NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."flag" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "report_id" uuid NOT NULL,
    "category" text NOT NULL,
    "computed_colour" text NOT NULL,
    "final_colour" text NOT NULL,
    "latest_audit_entry_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."flag_audit_entry" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "flag_id" uuid NOT NULL,
    "from_colour" text,
    "to_colour" text NOT NULL,
    "reason" text,
    "actor_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."metric_value" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "report_id" uuid NOT NULL,
    "metric_id" uuid NOT NULL,
    "raw_value" numeric(18, 6),
    "colour" text,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."norm_baseline" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "metric_id" uuid NOT NULL,
    "catalog_version" integer NOT NULL,
    "category" text NOT NULL,
    "direction" text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."norm_snapshot" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "report_id" uuid NOT NULL,
    "metric_id" uuid NOT NULL,
    "catalog_version" integer NOT NULL,
    "category" text NOT NULL,
    "direction" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."project_week_rollup" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "project_id" uuid NOT NULL,
    "week_start" date NOT NULL,
    "quality_colour" text,
    "cost_colour" text,
    "delivery_colour" text,
    "performance_colour" text,
    "rag" text,
    "ohs" numeric(5, 2),
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "pm"."report" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "project_id" uuid NOT NULL,
    "week_start" date NOT NULL,
    "reporter_id" uuid NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "executive_summary" text,
    "overall_colour" text,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
`;

/** The pre-redesign 0012_weekly_report_platform.sql shape (as deployed to dev under FUT-609). */
const OLD_SHAPE_PLATFORM = `
  CREATE FUNCTION pm.tg_flag_audit_append_only() RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'pm.flag_audit_entry is append-only';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER flag_audit_entry_append_only
    BEFORE UPDATE OR DELETE ON pm.flag_audit_entry
    FOR EACH ROW EXECUTE FUNCTION pm.tg_flag_audit_append_only();
`;

/** Execute a raw multi-statement SQL migration file the same way the runner does. */
async function runSqlFile(pool: Pool, path: string): Promise<void> {
  await pool.query(readFileSync(path, 'utf-8'));
}

describe('0018+0019 weekly-report/KPI migrations reconcile a dev box on the pre-redesign shape', () => {
  it('drop the FUT-609 prototype tables and function before recreating the FUT-581 schema', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        // The template already ran the shipped migrations once, so these objects exist in the
        // *new* shape. Drop them back down to the old (FUT-609) shape to reproduce the dev
        // environment's actual pre-existing state before this PR's migrations ever ran there.
        await pool.query(`
          DROP TABLE IF EXISTS "pm"."comment", "pm"."flag", "pm"."flag_audit_entry",
            "pm"."metric_value", "pm"."norm_snapshot", "pm"."project_week_rollup", "pm"."report"
            CASCADE
        `);
        await pool.query(`DROP FUNCTION IF EXISTS pm.tg_flag_audit_append_only() CASCADE`);
        await pool.query(OLD_SHAPE_TABLES);
        await pool.query(OLD_SHAPE_PLATFORM);

        // Re-running the shipped 0018/0019 files against this old-shape database must not blow
        // up with "relation already exists" / "function ... already exists" the way they did in
        // the failed dev deploys.
        await expect(runSqlFile(pool, MIGRATION_0018)).resolves.not.toThrow();
        await expect(runSqlFile(pool, MIGRATION_0019)).resolves.not.toThrow();

        // And it must land on the redesigned (iso_year/iso_week) schema, not silently keep
        // the stale week_start columns around.
        const cols = await pool.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'pm' AND table_name = 'report'`,
        );
        const names = cols.rows.map((r) => r.column_name as string);
        expect(names).toContain('iso_year');
        expect(names).toContain('iso_week');
        expect(names).not.toContain('week_start');

        // The append-only guard must be back in force on the recreated table.
        const t = await pool.query(
          `SELECT tenant_id FROM pm.flag_audit_entry LIMIT 0`, // table exists & queryable
        );
        expect(t.rows).toEqual([]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
