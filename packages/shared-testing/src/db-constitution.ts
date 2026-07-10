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
  exemptSchemas?: readonly string[];
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

/**
 * Schemas that exist in a running database but that no module owns. `graphile_worker` is the job
 * runner's own. `people_rag` is created at runtime by Mastra's PgVector, so a migrated database
 * never contains it — it is named here so that when it does appear, it appears as a decision.
 */
export const EXEMPT_SCHEMAS: readonly string[] = ['graphile_worker', 'people_rag'];

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

interface TenantScopedUniqueRow {
  sch: string;
  tbl: string;
  idx: string;
  col: string | null;
  typ: string | null;
  indkey0: number | null;
}

// `indkey0` is selected so JS can tell an expression index (indkey[0] = 0) apart from a
// wrong-typed natural key: for an expression index the `col`/`typ` subselects return NULL.
async function tenantScopedUnique(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<TenantScopedUniqueRow>(
    `${OWNED_TABLE_CTE}, lead AS (
       SELECT t.sch, t.tbl, ic.relname idx, i.indkey[0] AS indkey0,
         (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=i.indkey[0]) col,
         (SELECT format_type(a.atttypid,NULL) FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=i.indkey[0]) typ
       FROM t
       JOIN pg_index i ON i.indrelid = t.oid
       JOIN pg_class ic ON ic.oid = i.indexrelid
       WHERE i.indisunique AND ${HAS_TENANT}
     )
     SELECT sch, tbl, idx, col, typ, indkey0 FROM lead
     WHERE col IS DISTINCT FROM 'tenant_id' AND typ IS DISTINCT FROM 'uuid'`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'tenant-scoped-unique',
    object: `${r.sch}.${r.tbl}::${r.idx}`,
    detail: r.indkey0 === 0 ? 'expression index' : `lead=${r.col ?? '?'} typ=${r.typ ?? '?'}`,
  }));
}

interface OrderedPairRow {
  sch: string;
  tbl: string;
  lo: string;
  hi: string;
}

async function orderedPairCheck(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<OrderedPairRow>(
    `${OWNED_TABLE_CTE}, cols AS (
       SELECT t.sch, t.tbl, t.oid, a.attname col
       FROM t
       JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
       -- Only a real instant orders. people.worker.work_start/work_end are \`time\`: a daily
       -- shift window, where end < start is a legitimate night shift crossing midnight.
       WHERE format_type(a.atttypid,NULL) = 'date' OR format_type(a.atttypid,NULL) LIKE 'timestamp%'
     ), pairs AS (
       SELECT l.sch, l.tbl, l.oid, l.col lo, h.col hi
       FROM cols l JOIN cols h ON l.oid = h.oid
       WHERE l.col ~ '(^|_)(from|start)(_|$)' AND h.col ~ '(^|_)(to|end)(_|$)'
         AND regexp_replace(l.col,'(^|_)(from|start)(_|$)','\\1|\\3')
           = regexp_replace(h.col,'(^|_)(to|end)(_|$)','\\1|\\3')
     )
     SELECT p.sch, p.tbl, p.lo, p.hi FROM pairs p
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_constraint co WHERE co.conrelid = p.oid AND co.contype = 'c'
         AND pg_get_constraintdef(co.oid) ~ ('\\m' || p.lo || '\\M')
         AND pg_get_constraintdef(co.oid) ~ ('\\m' || p.hi || '\\M'))`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'ordered-pair-check',
    object: `${r.sch}.${r.tbl}.(${r.lo},${r.hi})`,
    detail: 'no CHECK orders the pair',
  }));
}

interface TimestampShapeRow {
  sch: string;
  tbl: string;
  col: string;
  typ: string;
  notnull: boolean;
  hasdefault: boolean;
}

async function timestampShape(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<TimestampShapeRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, a.attname AS col, format_type(a.atttypid,NULL) AS typ, a.attnotnull AS notnull,
       EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = t.oid AND d.adnum = a.attnum) AS hasdefault
     FROM t
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname IN ('created_at','updated_at')
     WHERE format_type(a.atttypid,NULL) <> 'timestamp with time zone' OR NOT a.attnotnull
       OR NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = t.oid AND d.adnum = a.attnum)`,
    [schemas],
  );
  return rows.map((r) => {
    const reasons: string[] = [];
    if (r.typ !== 'timestamp with time zone') reasons.push(`type=${r.typ}`);
    if (!r.notnull) reasons.push('nullable');
    if (!r.hasdefault) reasons.push('no default');
    return {
      rule: 'timestamp-shape',
      object: `${r.sch}.${r.tbl}.${r.col}`,
      detail: reasons.join(', '),
    };
  });
}

async function updatedAtTrigger(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<TableRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl
     FROM t
     WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'updated_at'
                   AND a.attnum > 0 AND NOT a.attisdropped)
       AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = t.oid AND NOT tg.tgisinternal)`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'updated-at-trigger',
    object: `${r.sch}.${r.tbl}`,
    detail: 'has updated_at but no non-internal trigger',
  }));
}

interface VersionColumnRow {
  sch: string;
  tbl: string;
  typ: string | null;
  notnull: boolean | null;
  defexpr: string | null;
}

async function versionColumn(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<VersionColumnRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, format_type(a.atttypid,NULL) AS typ, a.attnotnull AS notnull,
       pg_get_expr(d.adbin, d.adrelid) AS defexpr
     FROM t
     LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'version'
       AND a.attnum > 0 AND NOT a.attisdropped
     LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
     WHERE EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = t.oid AND NOT tg.tgisinternal)
       AND NOT (
         a.attname IS NOT NULL
         AND format_type(a.atttypid,NULL) = 'integer'
         AND a.attnotnull
         AND pg_get_expr(d.adbin, d.adrelid) = '1'
       )`,
    [schemas],
  );
  return rows.map((r) => {
    const reasons: string[] = [];
    if (r.typ === null) reasons.push('column missing');
    else {
      if (r.typ !== 'integer') reasons.push(`type=${r.typ}`);
      if (!r.notnull) reasons.push('nullable');
      if (r.defexpr !== '1') reasons.push(`default=${r.defexpr ?? 'none'}`);
    }
    return { rule: 'version-column', object: `${r.sch}.${r.tbl}`, detail: reasons.join(', ') };
  });
}

interface NumericRangeRow {
  sch: string;
  tbl: string;
  col: string;
  detail: string;
}

async function numericRangeCheck(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<NumericRangeRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl, a.attname AS col, 'no range check' AS detail
     FROM t
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE format_type(a.atttypid,NULL) = 'numeric'
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint co WHERE co.conrelid = t.oid AND co.contype = 'c'
           AND pg_get_constraintdef(co.oid) ~ ('\\m' || a.attname || '\\M'))
     UNION ALL
     SELECT t.sch, t.tbl, a.attname AS col, 'float type' AS detail
     FROM t
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE format_type(a.atttypid,NULL) IN ('double precision','real')`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'numeric-range-check',
    object: `${r.sch}.${r.tbl}.${r.col}`,
    detail: r.detail,
  }));
}

interface ProjectionShapeRow {
  sch: string;
  tbl: string;
  hastenant: boolean;
  hasupdated: boolean;
}

async function projectionShape(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<ProjectionShapeRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl,
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'tenant_id'
               AND a.attnum > 0 AND NOT a.attisdropped) AS hastenant,
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'updated_at'
               AND a.attnum > 0 AND NOT a.attisdropped) AS hasupdated
     FROM t
     WHERE t.tbl LIKE '%\\_projection' ESCAPE '\\'
       AND NOT (
         EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'tenant_id'
                 AND a.attnum > 0 AND NOT a.attisdropped)
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'updated_at'
                     AND a.attnum > 0 AND NOT a.attisdropped)
       )`,
    [schemas],
  );
  return rows.map((r) => {
    const missing = [!r.hastenant && 'tenant_id', !r.hasupdated && 'updated_at']
      .filter((x): x is string => Boolean(x))
      .join(',');
    return {
      rule: 'projection-shape',
      object: `${r.sch}.${r.tbl}`,
      detail: `missing=${missing}`,
    };
  });
}

async function createdAtPresent(pool: Pool, schemas: readonly string[]): Promise<Violation[]> {
  const { rows } = await pool.query<TableRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl FROM t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = t.oid AND a.attname = 'created_at' AND a.attnum > 0 AND NOT a.attisdropped
     )`,
    [schemas],
  );
  return rows.map((r) => ({
    rule: 'created-at-present',
    object: `${r.sch}.${r.tbl}`,
    detail: 'no created_at column',
  }));
}

/**
 * `OWNED_SCHEMAS` is a hand-maintained list, and every other rule filters by it — so a schema
 * missing from it is governed by nothing at all. The old `schema.ts` lint auto-discovered new
 * modules; this rule is what replaces that property.
 */
async function schemaGoverned(
  pool: Pool,
  schemas: readonly string[],
  exemptSchemas: readonly string[],
): Promise<Violation[]> {
  const { rows } = await pool.query<SchemaRow>(
    `SELECT nspname FROM pg_namespace
     WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'public')
       AND nspname <> ALL($1::text[]) AND nspname <> ALL($2::text[])`,
    [schemas, exemptSchemas],
  );
  return rows.map((r) => ({
    rule: 'schema-governed',
    object: `schema:${r.nspname}`,
    detail: 'schema is in the database but not in OWNED_SCHEMAS — no rule inspects its tables',
  }));
}

async function lifecycleRegistered(
  pool: Pool,
  schemas: readonly string[],
  lifecycleTables: readonly string[],
): Promise<Violation[]> {
  const { rows } = await pool.query<TableRow>(
    `${OWNED_TABLE_CTE}
     SELECT t.sch, t.tbl FROM t
     WHERE (t.sch || '.' || t.tbl) <> ALL($2::text[])`,
    [schemas, lifecycleTables],
  );
  return rows.map((r) => ({
    rule: 'lifecycle-registered',
    object: `${r.sch}.${r.tbl}`,
    detail: 'not present in the shared-db lifecycle registry',
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
    tenantScopedUnique(pool, opts.schemas),
    orderedPairCheck(pool, opts.schemas),
    timestampShape(pool, opts.schemas),
    updatedAtTrigger(pool, opts.schemas),
    versionColumn(pool, opts.schemas),
    numericRangeCheck(pool, opts.schemas),
    projectionShape(pool, opts.schemas),
    createdAtPresent(pool, opts.schemas),
    schemaGoverned(pool, opts.schemas, opts.exemptSchemas ?? EXEMPT_SCHEMAS),
    lifecycleRegistered(pool, opts.schemas, opts.lifecycleTables),
  ]);
  // Byte order, not localeCompare: `object` is the baseline's join key, and ICU collation
  // orders `.` `:` `::` differently across versions — a baseline generated on one machine
  // would reorder on another.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return results.flat().sort((a, b) => cmp(a.rule, b.rule) || cmp(a.object, b.object));
}
