import type { Pool } from 'pg';

export interface Violation {
  rule: string;
  object: string;
  detail: string;
}

export interface ConstitutionOpts {
  schemas: readonly string[];
  lifecycleTables: readonly string[];
  appRole?: string;
}

export const OWNED_SCHEMAS: readonly string[] = [
  'agent',
  'core',
  'hiring',
  'identity',
  'integrations',
  'knowledge',
  'notifications',
  'people',
  'planner',
  'pm',
];

export const TENANT_ID_EXEMPT: readonly string[] = [
  'tenants',
  'rpc_idempotency',
  'subscription_cursors',
  'subscription_processed',
  'subscription_dead_letter',
  'subscription_failure_state',
  'session',
  'account',
  'verification',
  'rate_limit',
  'failed_login_attempts',
  'failed_login_alerts_sent',
];

const CANONICAL_POLICY =
  "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)";

// Shared by every table-scanning rule so the exempt/partition filter is applied once,
// in SQL, rather than re-derived per rule (see db4-shared-rules.md: exempt filtering
// must be SQL, not JS, so every rule is exempt-consistent by construction).
const OWNED_TABLE_CTE = `WITH t AS (
  SELECT c.oid, n.nspname AS sch, c.relname AS tbl, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p') AND NOT c.relispartition
    AND n.nspname = ANY($1::text[])
    AND c.relname !~ '^mastra_' AND c.relname NOT IN ('memory_messages','__platform_migrations')
)`;

const HAS_TENANT = `EXISTS (
  SELECT 1 FROM pg_attribute a
  WHERE a.attrelid = t.oid AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
)`;

interface RlsRow {
  sch: string;
  tbl: string;
  rls: boolean;
  forced: boolean;
}

async function rlsEnabledForced(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<RlsRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, t.rls, t.forced
     FROM t
     WHERE ${HAS_TENANT} AND NOT (t.rls AND t.forced)`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'rls-enabled-forced',
    object: `${r.sch}.${r.tbl}`,
    detail: `rls=${r.rls} forced=${r.forced}`,
  }));
}

interface PolicyRow {
  sch: string;
  tbl: string;
  polname: string;
  q: string | null;
}

async function rlsPolicyUniform(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<PolicyRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, p.polname, pg_get_expr(p.polqual, p.polrelid) AS q
     FROM pg_policy p
     JOIN t ON t.oid = p.polrelid
     WHERE p.polname <> 'tenant_isolation' OR pg_get_expr(p.polqual, p.polrelid) IS DISTINCT FROM $2`,
    [schemas, CANONICAL_POLICY],
  );
  // A table may carry several policies; the object must name one, or two bad policies on the
  // same table would collide into a single un-baselineable (rule, object) pair.
  return rows.map((r) => ({
    rule: 'rls-policy-uniform',
    object: `${r.sch}.${r.tbl}::${r.polname}`,
    detail: `expr=${r.q}`,
  }));
}

interface ShapeRow {
  sch: string;
  tbl: string;
  type: string;
  notnull: boolean;
}

async function tenantIdShape(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<ShapeRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, format_type(a.atttypid, null) AS type, a.attnotnull AS notnull
     FROM t
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
     WHERE format_type(a.atttypid, null) <> 'uuid' OR NOT a.attnotnull`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'tenant-id-shape',
    object: `${r.sch}.${r.tbl}.tenant_id`,
    detail: `type=${r.type} notnull=${r.notnull}`,
  }));
}

interface TableRow {
  sch: string;
  tbl: string;
}

async function tenantIdPresent(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<TableRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl
     FROM t
     WHERE NOT ${HAS_TENANT} AND t.tbl <> ALL($2::text[])`,
    [schemas, TENANT_ID_EXEMPT],
  );
  return rows.map((r) => ({
    rule: 'tenant-id-present',
    object: `${r.sch}.${r.tbl}`,
    detail: 'no tenant_id column',
  }));
}

interface RoleRow {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

async function appRolePrivilege(pool: Pool, appRole: string): Promise<Violation[]> {
  const { rows } = await pool.query<RoleRow>(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
     WHERE (rolcanlogin OR rolbypassrls) AND rolname !~ '^pg_'`,
  );
  const violations: Violation[] = [];
  for (const r of rows) {
    if (r.rolname === appRole || r.rolsuper) continue;
    if (r.rolbypassrls) {
      violations.push({
        rule: 'app-role-privilege',
        object: `role:${r.rolname}`,
        detail: 'rolbypassrls=true',
      });
    }
  }
  const appRow = rows.find((r) => r.rolname === appRole);
  if (!appRow) {
    violations.push({
      rule: 'app-role-privilege',
      object: `role:${appRole}`,
      detail: 'role missing',
    });
  } else if (appRow.rolsuper || appRow.rolbypassrls) {
    violations.push({
      rule: 'app-role-privilege',
      object: `role:${appRole}`,
      detail: `rolsuper=${appRow.rolsuper} rolbypassrls=${appRow.rolbypassrls}`,
    });
  }
  return violations;
}

interface GrantRow {
  sch: string;
  tbl: string;
  sel: boolean;
  ins: boolean;
  upd: boolean;
  del: boolean;
}

async function appRoleGrants(
  pool: Pool,
  schemas: readonly string[],
  appRole: string,
): Promise<Violation[]> {
  const { rows } = await pool.query<GrantRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl,
       has_table_privilege($2, t.oid, 'SELECT') AS sel,
       has_table_privilege($2, t.oid, 'INSERT') AS ins,
       has_table_privilege($2, t.oid, 'UPDATE') AS upd,
       has_table_privilege($2, t.oid, 'DELETE') AS del
     FROM t
     WHERE NOT (
       has_table_privilege($2, t.oid, 'SELECT') AND has_table_privilege($2, t.oid, 'INSERT')
       AND has_table_privilege($2, t.oid, 'UPDATE') AND has_table_privilege($2, t.oid, 'DELETE')
     )`,
    [schemas, appRole],
  );
  return rows.map((r) => {
    const missing = [!r.sel && 'SELECT', !r.ins && 'INSERT', !r.upd && 'UPDATE', !r.del && 'DELETE']
      .filter((x): x is string => Boolean(x))
      .join(',');
    return { rule: 'app-role-grants', object: `${r.sch}.${r.tbl}`, detail: `missing=${missing}` };
  });
}

interface SchemaRow {
  nspname: string;
}

async function appRoleNoCreate(
  pool: Pool,
  schemas: readonly string[],
  appRole: string,
): Promise<Violation[]> {
  const { rows } = await pool.query<SchemaRow>(
    `SELECT nspname FROM pg_namespace
     WHERE nspname = ANY($1::text[])
       AND (NOT has_schema_privilege($2, nspname, 'USAGE') OR has_schema_privilege($2, nspname, 'CREATE'))`,
    [schemas, appRole],
  );
  return rows.map((r) => ({
    rule: 'app-role-no-create',
    object: `schema:${r.nspname}`,
    detail: 'missing USAGE or has CREATE on schema',
  }));
}

interface FkRow {
  sch: string;
  tbl: string;
  conname: string;
}

async function noCrossSchemaFk(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<FkRow>(
    `${OWNED_TABLE_CTE}
     SELECT tc.sch, tc.tbl, co.conname
     FROM pg_constraint co
     JOIN t tc ON tc.oid = co.conrelid
     JOIN t tp ON tp.oid = co.confrelid
     WHERE co.contype = 'f' AND tc.sch <> tp.sch`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'no-cross-schema-fk',
    object: `${r.sch}.${r.tbl}::${r.conname}`,
    detail: 'foreign key crosses schemas',
  }));
}

export async function collectViolations(pool: Pool, opts: ConstitutionOpts): Promise<Violation[]> {
  const appRole = opts.appRole ?? 'seta_app';
  const results = await Promise.all([
    rlsEnabledForced(pool, opts.schemas),
    rlsPolicyUniform(pool, opts.schemas),
    tenantIdShape(pool, opts.schemas),
    tenantIdPresent(pool, opts.schemas),
    appRolePrivilege(pool, appRole),
    appRoleGrants(pool, opts.schemas, appRole),
    appRoleNoCreate(pool, opts.schemas, appRole),
    noCrossSchemaFk(pool, opts.schemas),
  ]);
  // Byte order, not localeCompare: `object` is the baseline's join key, and ICU collation
  // orders `.` `:` `::` differently across versions — a baseline generated on one machine
  // would reorder on another.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return results.flat().sort((a, b) => cmp(a.rule, b.rule) || cmp(a.object, b.object));
}
