import { type ConstitutionOpts, collectViolations, type Violation } from '@seta/shared-testing';
import { Pool } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

const SCHEMA = 'ct_probe';
const SCHEMA2 = 'ct_probe2';
let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: `${process.env.PLATFORM_TEST_PG_BASE}/postgres` });
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='seta_app') THEN
      CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
    END IF; END $$;`);
});

// lifecycleTables defaults to registering `${SCHEMA}.t` — the table name every Task-1 and
// most Task-2 fixtures use — so lifecycle-registered stays silent by default and doesn't
// pollute unrelated rules' exact-list assertions. Tests for lifecycle-registered itself, or
// that use a different table name (e.g. the projection fixtures), pass an explicit override.
async function fresh(ddl: string, opts: Partial<ConstitutionOpts> = {}): Promise<Violation[]> {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  // Also drop SCHEMA2, or a schema left behind by the cross-schema-FK test is reported by
  // schema-governed in whatever test runs next.
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA2} CASCADE`);
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await pool.query(ddl);
  return collectViolations(pool, {
    schemas: [SCHEMA],
    lifecycleTables: [`${SCHEMA}.t`],
    ...opts,
  });
}
const rules = (v: Violation[], object: string) =>
  v
    .filter((x) => x.object === object)
    .map((x) => x.rule)
    .sort();

// Fully compliant table fixture: satisfies rls-enabled-forced, rls-policy-uniform,
// tenant-id-shape, tenant-id-present, and app-role-grants at once, so each rule's
// describe block can flip exactly one dimension and stay isolated on the object.
const COMPLIANT_TABLE = `
  CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON ${SCHEMA}.t
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
`;

describe('rls-enabled-forced', () => {
  it('fires on a tenant table with RLS off', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['rls-enabled-forced']);
  });
  it('fires on a tenant table with RLS enabled but not forced', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['rls-enabled-forced']);
  });
  it('is silent when enabled and forced', async () => {
    // A table with only RLS enabled+forced still lacks seta_app grants, which
    // app-role-grants (below) correctly flags — use the fully-compliant fixture so
    // this "silent" case is silent across every rule, not just this one.
    const v = await fresh(COMPLIANT_TABLE);
    expect(rules(v, `${SCHEMA}.t`)).toEqual([]);
  });
});

describe('rls-policy-uniform', () => {
  it('fires when the policy expression lacks NULLIF', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
      CREATE POLICY tenant_isolation ON ${SCHEMA}.t USING (tenant_id = current_setting('app.tenant_id')::uuid);`);
    expect(rules(v, `${SCHEMA}.t::tenant_isolation`)).toEqual(['rls-policy-uniform']);
  });
  it('fires when the policy is not named tenant_isolation', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
      CREATE POLICY other_name ON ${SCHEMA}.t
        USING (tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid);`);
    expect(rules(v, `${SCHEMA}.t::other_name`)).toEqual(['rls-policy-uniform']);
  });
  it('names each offending policy separately', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
      CREATE POLICY bad_one ON ${SCHEMA}.t USING (tenant_id IS NOT NULL);
      CREATE POLICY bad_two ON ${SCHEMA}.t USING (tenant_id IS NOT NULL);`);
    expect(v.filter((x) => x.rule === 'rls-policy-uniform').map((x) => x.object)).toEqual([
      `${SCHEMA}.t::bad_one`,
      `${SCHEMA}.t::bad_two`,
    ]);
  });
  it('is silent for the canonical policy', async () => {
    const v = await fresh(COMPLIANT_TABLE);
    expect(v.filter((x) => x.rule === 'rls-policy-uniform')).toEqual([]);
  });
});

describe('tenant-id-shape', () => {
  it('fires when tenant_id is text', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual(['tenant-id-shape']);
  });
  it('fires when tenant_id is uuid but nullable', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual(['tenant-id-shape']);
  });
  it('is silent for tenant_id uuid NOT NULL', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual([]);
  });
});

describe('tenant-id-present', () => {
  it('fires on a table with no tenant_id', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['tenant-id-present']);
  });
  it('is silent on a mastra_ table', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.mastra_foo (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.mastra_foo`)).toEqual([]);
  });
  it('is silent on a table in TENANT_ID_EXEMPT', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.tenants (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.tenants`)).not.toContain('tenant-id-present');
  });
});

describe('app-role-privilege', () => {
  it('is silent when seta_app exists as NOSUPERUSER NOBYPASSRLS', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, 'role:seta_app')).toEqual([]);
  });
  it('fires on a non-superuser role with BYPASSRLS', async () => {
    await pool.query(`DROP ROLE IF EXISTS ct_bad_role`);
    await pool.query(`CREATE ROLE ct_bad_role LOGIN BYPASSRLS`);
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await pool.query(`DROP ROLE ct_bad_role`);
    expect(rules(v, 'role:ct_bad_role')).toEqual(['app-role-privilege']);
  });
});

describe('app-role-grants', () => {
  it('fires when seta_app has no grants on a tenant table', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON ${SCHEMA}.t
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['app-role-grants']);
  });
  it('is silent once seta_app has full CRUD grants', async () => {
    const v = await fresh(COMPLIANT_TABLE);
    expect(rules(v, `${SCHEMA}.t`)).toEqual([]);
  });
});

describe('app-role-no-create', () => {
  it('fires when seta_app has CREATE on the schema', async () => {
    const v = await fresh(`GRANT USAGE ON SCHEMA ${SCHEMA} TO seta_app;
      GRANT CREATE ON SCHEMA ${SCHEMA} TO seta_app;`);
    expect(rules(v, `schema:${SCHEMA}`)).toEqual(['app-role-no-create']);
  });
  it('is silent after REVOKE CREATE', async () => {
    const v = await fresh(`GRANT USAGE ON SCHEMA ${SCHEMA} TO seta_app;
      GRANT CREATE ON SCHEMA ${SCHEMA} TO seta_app;
      REVOKE CREATE ON SCHEMA ${SCHEMA} FROM seta_app;`);
    expect(rules(v, `schema:${SCHEMA}`)).toEqual([]);
  });
});

describe('no-cross-schema-fk', () => {
  it('fires when a foreign key crosses schemas', async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA2} CASCADE`);
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    await pool.query(`CREATE SCHEMA ${SCHEMA2}`);
    await pool.query(
      `CREATE TABLE ${SCHEMA}.parent (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await pool.query(
      `CREATE TABLE ${SCHEMA2}.child (id uuid PRIMARY KEY, parent_id uuid REFERENCES ${SCHEMA}.parent(id), created_at timestamptz NOT NULL DEFAULT now())`,
    );
    const v = await collectViolations(pool, { schemas: [SCHEMA, SCHEMA2], lifecycleTables: [] });
    expect(rules(v, `${SCHEMA2}.child::child_parent_id_fkey`)).toEqual(['no-cross-schema-fk']);
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA2} CASCADE`);
  });
  it('is silent when the foreign key stays inside one schema', async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    await pool.query(
      `CREATE TABLE ${SCHEMA}.parent (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await pool.query(
      `CREATE TABLE ${SCHEMA}.child (id uuid PRIMARY KEY, parent_id uuid REFERENCES ${SCHEMA}.parent(id), created_at timestamptz NOT NULL DEFAULT now())`,
    );
    const v = await collectViolations(pool, { schemas: [SCHEMA], lifecycleTables: [] });
    expect(rules(v, `${SCHEMA}.child::child_parent_id_fkey`)).toEqual([]);
  });
});

describe('tenant-scoped-unique', () => {
  it('is silent on a uuid surrogate primary key', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.t::t_pkey`)).toEqual([]);
  });
  it('fires on a natural key that does not lead with tenant_id', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, slug text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX t_slug ON ${SCHEMA}.t (slug);`);
    expect(rules(v, `${SCHEMA}.t::t_slug`)).toEqual(['tenant-scoped-unique']);
  });
  it('is silent when the natural key leads with tenant_id', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, slug text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX t_slug ON ${SCHEMA}.t (tenant_id, slug);`);
    expect(rules(v, `${SCHEMA}.t::t_slug`)).toEqual([]);
  });
  it('fires with detail "expression index" on a unique expression index', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX t_email_lower ON ${SCHEMA}.t (lower(email));`);
    expect(rules(v, `${SCHEMA}.t::t_email_lower`)).toEqual(['tenant-scoped-unique']);
    const hit = v.find((x) => x.object === `${SCHEMA}.t::t_email_lower`);
    expect(hit?.detail).toBe('expression index');
  });
  it('is silent on a unique index on a table with no tenant_id column', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, slug text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX t_slug ON ${SCHEMA}.t (slug);`);
    expect(rules(v, `${SCHEMA}.t::t_slug`)).toEqual([]);
  });
});

describe('ordered-pair-check', () => {
  it('fires on an unconstrained date pair', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      date_from date, date_to date, created_at timestamptz NOT NULL DEFAULT now())`);
    expect(rules(v, `${SCHEMA}.t.(date_from,date_to)`)).toEqual(['ordered-pair-check']);
  });
  it('is silent when a CHECK names both columns', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      date_from date, date_to date, CHECK (date_to >= date_from), created_at timestamptz NOT NULL DEFAULT now())`);
    expect(rules(v, `${SCHEMA}.t.(date_from,date_to)`)).toEqual([]);
  });
  // people.worker_history (from_val, to_val) are jsonb — the before/after of an audited
  // field change, not a time range. Name-only pair detection would flag them.
  it('does not fire on a non-temporal from/to pair', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      from_val jsonb, to_val jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
    expect(v.filter((x) => x.rule === 'ordered-pair-check')).toEqual([]);
  });
  it('is silent on a table with no tenant_id (rule is not tenancy-gated)', async () => {
    const v =
      await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, start_at timestamptz, end_at timestamptz,
      CHECK (end_at >= start_at), created_at timestamptz NOT NULL DEFAULT now())`);
    expect(v.filter((x) => x.rule === 'ordered-pair-check')).toEqual([]);
  });
  it('fires on an unconstrained pair on a table with no tenant_id', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, start_at timestamptz, end_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    expect(rules(v, `${SCHEMA}.t.(start_at,end_at)`)).toEqual(['ordered-pair-check']);
  });
});

describe('version-column', () => {
  const trigger = `
    CREATE FUNCTION ${SCHEMA}.touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER t_touch BEFORE UPDATE ON ${SCHEMA}.t FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.touch();`;
  const withUpdatedAt = `${COMPLIANT_TABLE}
    ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();`;

  // planner.task_comments: updated_at trigger, no version. The S8 canary.
  it('fires on a trigger-maintained table with no version column', async () => {
    const v = await fresh(`${withUpdatedAt}${trigger}`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['version-column']);
  });
  it('is silent without a trigger', async () => {
    const v = await fresh(withUpdatedAt);
    expect(v.filter((x) => x.rule === 'version-column')).toEqual([]);
  });
  it('is silent with version integer NOT NULL DEFAULT 1', async () => {
    const v = await fresh(`${withUpdatedAt}${trigger}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN version integer NOT NULL DEFAULT 1;`);
    expect(v.filter((x) => x.rule === 'version-column')).toEqual([]);
  });
  it('fires when version exists but is nullable', async () => {
    const v = await fresh(`${withUpdatedAt}${trigger}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN version integer DEFAULT 1;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['version-column']);
  });
  it('fires when version exists but the default is not 1', async () => {
    const v = await fresh(`${withUpdatedAt}${trigger}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN version integer NOT NULL DEFAULT 0;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['version-column']);
  });
});

describe('timestamp-shape', () => {
  it('fires when updated_at is nullable', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz;`);
    expect(rules(v, `${SCHEMA}.t.updated_at`)).toEqual(['timestamp-shape']);
  });
  it('fires when updated_at has no default', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz NOT NULL;`);
    expect(rules(v, `${SCHEMA}.t.updated_at`)).toEqual(['timestamp-shape']);
  });
  it('fires when created_at is timestamp without time zone', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ALTER COLUMN created_at TYPE timestamp;`);
    expect(rules(v, `${SCHEMA}.t.created_at`)).toEqual(['timestamp-shape']);
  });
  it('is silent for correctly-shaped created_at and updated_at', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();`);
    expect(v.filter((x) => x.rule === 'timestamp-shape')).toEqual([]);
  });
});

describe('updated-at-trigger', () => {
  it('fires when updated_at exists with no non-internal trigger', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['updated-at-trigger']);
  });
  it('is silent when a trigger exists', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      CREATE FUNCTION ${SCHEMA}.touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER t_touch BEFORE UPDATE ON ${SCHEMA}.t FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.touch();`);
    expect(v.filter((x) => x.rule === 'updated-at-trigger')).toEqual([]);
  });
  it('is silent on a table with no updated_at column', async () => {
    const v = await fresh(COMPLIANT_TABLE);
    expect(v.filter((x) => x.rule === 'updated-at-trigger')).toEqual([]);
  });
});

describe('numeric-range-check', () => {
  it('fires on a numeric column with no CHECK, detail "no range check"', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN amount numeric(10,4);`);
    expect(rules(v, `${SCHEMA}.t.amount`)).toEqual(['numeric-range-check']);
    const hit = v.find((x) => x.object === `${SCHEMA}.t.amount`);
    expect(hit?.detail).toBe('no range check');
  });
  it('is silent when a CHECK names the numeric column', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN amount numeric(10,4);
      ALTER TABLE ${SCHEMA}.t ADD CONSTRAINT t_amount_range CHECK (amount >= 0 AND amount <= 100);`);
    expect(v.filter((x) => x.rule === 'numeric-range-check')).toEqual([]);
  });
  it('fires on a double precision column, detail "float type"', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN score double precision;`);
    expect(rules(v, `${SCHEMA}.t.score`)).toEqual(['numeric-range-check']);
    const hit = v.find((x) => x.object === `${SCHEMA}.t.score`);
    expect(hit?.detail).toBe('float type');
  });
  it('fires on a real column, detail "float type"', async () => {
    const v = await fresh(`${COMPLIANT_TABLE}
      ALTER TABLE ${SCHEMA}.t ADD COLUMN score real;`);
    expect(rules(v, `${SCHEMA}.t.score`)).toEqual(['numeric-range-check']);
    const hit = v.find((x) => x.object === `${SCHEMA}.t.score`);
    expect(hit?.detail).toBe('float type');
  });
});

describe('projection-shape', () => {
  const grants = `GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.foo_projection TO seta_app;`;

  it('fires when a _projection table lacks updated_at', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.foo_projection (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
       ALTER TABLE ${SCHEMA}.foo_projection ENABLE ROW LEVEL SECURITY;
       ALTER TABLE ${SCHEMA}.foo_projection FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON ${SCHEMA}.foo_projection
         USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
       ${grants}`,
      { lifecycleTables: [`${SCHEMA}.foo_projection`] },
    );
    expect(rules(v, `${SCHEMA}.foo_projection`)).toEqual(['projection-shape']);
    const hit = v.find((x) => x.object === `${SCHEMA}.foo_projection`);
    expect(hit?.detail).toContain('updated_at');
  });
  // A _projection table missing tenant_id necessarily also trips tenant-id-present — both
  // are true, independent facts about the table, so this case can't be isolated to one rule.
  it('fires when a _projection table lacks tenant_id', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.foo_projection (id uuid PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
       ${grants}`,
      { lifecycleTables: [`${SCHEMA}.foo_projection`] },
    );
    expect(rules(v, `${SCHEMA}.foo_projection`)).toContain('projection-shape');
    const hit = v.find(
      (x) => x.object === `${SCHEMA}.foo_projection` && x.rule === 'projection-shape',
    );
    expect(hit?.detail).toContain('tenant_id');
  });
  it('is silent when a _projection table has both tenant_id and updated_at', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.foo_projection (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
       ALTER TABLE ${SCHEMA}.foo_projection ENABLE ROW LEVEL SECURITY;
       ALTER TABLE ${SCHEMA}.foo_projection FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON ${SCHEMA}.foo_projection
         USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
       ${grants}`,
      { lifecycleTables: [`${SCHEMA}.foo_projection`] },
    );
    expect(v.filter((x) => x.rule === 'projection-shape')).toEqual([]);
  });
  it('is silent on a table not named _projection', async () => {
    const v = await fresh(COMPLIANT_TABLE);
    expect(v.filter((x) => x.rule === 'projection-shape')).toEqual([]);
  });
});

describe('lifecycle-registered', () => {
  it('fires when the table is absent from opts.lifecycleTables', async () => {
    const v = await fresh(COMPLIANT_TABLE, { lifecycleTables: [] });
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['lifecycle-registered']);
  });
  it('is silent when the table is present in opts.lifecycleTables', async () => {
    const v = await fresh(COMPLIANT_TABLE, { lifecycleTables: [`${SCHEMA}.t`] });
    expect(v.filter((x) => x.rule === 'lifecycle-registered')).toEqual([]);
  });
});

describe('created-at-present', () => {
  it('fires on a table with no created_at', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON ${SCHEMA}.t
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['created-at-present']);
  });
  it('is silent when created_at exists', async () => {
    const v = await fresh(COMPLIANT_TABLE);
    expect(rules(v, `${SCHEMA}.t`)).toEqual([]);
  });
  it('is silent on a mastra_ table', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.mastra_foo (id uuid PRIMARY KEY)`);
    expect(rules(v, `${SCHEMA}.mastra_foo`)).toEqual([]);
  });
});

// OWNED_SCHEMAS is hand-maintained, and every other rule filters by it — so a schema missing
// from it is governed by nothing. This rule is what replaces the old lint's auto-discovery of
// every packages/**/schema.ts.
describe('schema-governed', () => {
  it('fires on a schema absent from opts.schemas', async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA2} CASCADE`);
    const v = await fresh(COMPLIANT_TABLE);
    await pool.query(`CREATE SCHEMA ${SCHEMA2}`);
    const after = await collectViolations(pool, {
      schemas: [SCHEMA],
      lifecycleTables: [`${SCHEMA}.t`],
      exemptSchemas: [],
    });
    await pool.query(`DROP SCHEMA ${SCHEMA2} CASCADE`);
    expect(v.filter((x) => x.rule === 'schema-governed')).toEqual([]);
    expect(after.filter((x) => x.rule === 'schema-governed').map((x) => x.object)).toEqual([
      `schema:${SCHEMA2}`,
    ]);
  });
  it('is silent for an exempt schema', async () => {
    await fresh(COMPLIANT_TABLE);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA2}`);
    const v = await collectViolations(pool, {
      schemas: [SCHEMA],
      lifecycleTables: [`${SCHEMA}.t`],
      exemptSchemas: [SCHEMA2],
    });
    await pool.query(`DROP SCHEMA ${SCHEMA2} CASCADE`);
    expect(v.filter((x) => x.rule === 'schema-governed')).toEqual([]);
  });
});
