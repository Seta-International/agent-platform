import { collectViolations, type Violation } from '@seta/shared-testing';
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

async function fresh(ddl: string): Promise<Violation[]> {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await pool.query(ddl);
  return collectViolations(pool, { schemas: [SCHEMA], lifecycleTables: [] });
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
  CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
  ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON ${SCHEMA}.t
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
`;

describe('rls-enabled-forced', () => {
  it('fires on a tenant table with RLS off', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['rls-enabled-forced']);
  });
  it('fires on a tenant table with RLS enabled but not forced', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
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
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
      CREATE POLICY tenant_isolation ON ${SCHEMA}.t USING (tenant_id = current_setting('app.tenant_id')::uuid);`);
    expect(rules(v, `${SCHEMA}.t::tenant_isolation`)).toEqual(['rls-policy-uniform']);
  });
  it('fires when the policy is not named tenant_isolation', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      ALTER TABLE ${SCHEMA}.t ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${SCHEMA}.t FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;
      CREATE POLICY other_name ON ${SCHEMA}.t
        USING (tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid);`);
    expect(rules(v, `${SCHEMA}.t::other_name`)).toEqual(['rls-policy-uniform']);
  });
  it('names each offending policy separately', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
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
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id text NOT NULL)`,
    );
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual(['tenant-id-shape']);
  });
  it('fires when tenant_id is uuid but nullable', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid)`);
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual(['tenant-id-shape']);
  });
  it('is silent for tenant_id uuid NOT NULL', async () => {
    const v = await fresh(
      `CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL)`,
    );
    expect(rules(v, `${SCHEMA}.t.tenant_id`)).toEqual([]);
  });
});

describe('tenant-id-present', () => {
  it('fires on a table with no tenant_id', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY);
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${SCHEMA}.t TO seta_app;`);
    expect(rules(v, `${SCHEMA}.t`)).toEqual(['tenant-id-present']);
  });
  it('is silent on a mastra_ table', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.mastra_foo (id uuid PRIMARY KEY)`);
    expect(rules(v, `${SCHEMA}.mastra_foo`)).toEqual([]);
  });
  it('is silent on a table in TENANT_ID_EXEMPT', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.tenants (id uuid PRIMARY KEY)`);
    expect(rules(v, `${SCHEMA}.tenants`)).not.toContain('tenant-id-present');
  });
});

describe('app-role-privilege', () => {
  it('is silent when seta_app exists as NOSUPERUSER NOBYPASSRLS', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY)`);
    expect(rules(v, 'role:seta_app')).toEqual([]);
  });
  it('fires on a non-superuser role with BYPASSRLS', async () => {
    await pool.query(`DROP ROLE IF EXISTS ct_bad_role`);
    await pool.query(`CREATE ROLE ct_bad_role LOGIN BYPASSRLS`);
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY)`);
    await pool.query(`DROP ROLE ct_bad_role`);
    expect(rules(v, 'role:ct_bad_role')).toEqual(['app-role-privilege']);
  });
});

describe('app-role-grants', () => {
  it('fires when seta_app has no grants on a tenant table', async () => {
    const v = await fresh(`CREATE TABLE ${SCHEMA}.t (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
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
    await pool.query(`CREATE TABLE ${SCHEMA}.parent (id uuid PRIMARY KEY)`);
    await pool.query(
      `CREATE TABLE ${SCHEMA2}.child (id uuid PRIMARY KEY, parent_id uuid REFERENCES ${SCHEMA}.parent(id))`,
    );
    const v = await collectViolations(pool, { schemas: [SCHEMA, SCHEMA2], lifecycleTables: [] });
    expect(rules(v, `${SCHEMA2}.child::child_parent_id_fkey`)).toEqual(['no-cross-schema-fk']);
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA2} CASCADE`);
  });
  it('is silent when the foreign key stays inside one schema', async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    await pool.query(`CREATE TABLE ${SCHEMA}.parent (id uuid PRIMARY KEY)`);
    await pool.query(
      `CREATE TABLE ${SCHEMA}.child (id uuid PRIMARY KEY, parent_id uuid REFERENCES ${SCHEMA}.parent(id))`,
    );
    const v = await collectViolations(pool, { schemas: [SCHEMA], lifecycleTables: [] });
    expect(rules(v, `${SCHEMA}.child::child_parent_id_fkey`)).toEqual([]);
  });
});
