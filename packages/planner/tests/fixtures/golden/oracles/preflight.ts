// packages/planner/tests/fixtures/golden/oracles/preflight.ts
//
// Golden-dataset preflight (spec §H). Runs before an eval to guarantee the DB
// is exactly the frozen dataset — no drift, no partial seed, no cross-tenant
// leak — so a green/red eval reflects the agent, never a corrupt fixture.
//
// It asserts, collecting ALL violations then throwing a single
// `Error('PREFLIGHT: ...')`:
//   1. facts        — generateGoldenFacts(db) deep-equals manifests/golden-facts.json
//   2. seedChecksum — the frozen seed sources hash matches dataset.json
//   3. counts       — main + decoy relational row counts match dataset.json.counts
//   4. isolation    — no main-tenant row carries a decoy canary string
//   5. embeddings   — (optional) each searchable entity has exactly one correctly
//                     tenanted, correctly modelled embedding; no orphans; counts match
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { DECOY_CANARY_TEXT, DECOY_TASK_CANARY, DECOY_TENANT_ID, TENANT_ID } from '../constants.ts';
import { diffGoldenFacts } from './facts-diff.ts';
import { type GoldenFacts, generateGoldenFacts } from './generate-facts.ts';
import { computeSeedChecksum } from './seed-checksum.ts';

// --- Pure embedding invariant checker (unit-tested independently) -----------

export interface EmbeddingRow {
  entityId: string;
  tenantId: string;
  modelId: string;
}

export interface EmbeddingExpectation {
  mainExpectedRows: number;
  decoyExpectedRows: number;
}

export interface EmbeddingInvariantParams {
  label: string; // 'tasks' | 'people' — for readable messages
  mainTenantId: string;
  decoyTenantId: string;
  entityIds: { main: string[]; decoy: string[] };
  rows: EmbeddingRow[];
  expected: EmbeddingExpectation;
  expectedModelId: string;
}

/**
 * Verifies the embedding rows for one index against the seeded entity sets.
 * Returns a (possibly empty) list of violation strings — never throws — so the
 * caller can aggregate across indexes. "Searchable entity" == a seeded,
 * non-deleted task/person; each must have exactly one embedding under its own
 * tenant, with the expected model, and no orphan/leaked rows may exist.
 */
export function checkEmbeddingInvariants(params: EmbeddingInvariantParams): string[] {
  const { label, mainTenantId, decoyTenantId, entityIds, rows, expected, expectedModelId } = params;
  const v: string[] = [];

  const mainSet = new Set(entityIds.main);
  const decoySet = new Set(entityIds.decoy);

  const countByTenant = new Map<string, number>();
  const seen = new Map<string, EmbeddingRow[]>(); // key `${tenantId}:${entityId}`

  for (const row of rows) {
    if (row.modelId !== expectedModelId) {
      v.push(
        `${label}: embedding for ${row.entityId} has model "${row.modelId}", expected "${expectedModelId}"`,
      );
    }
    countByTenant.set(row.tenantId, (countByTenant.get(row.tenantId) ?? 0) + 1);

    const belongsHere =
      (row.tenantId === mainTenantId && mainSet.has(row.entityId)) ||
      (row.tenantId === decoyTenantId && decoySet.has(row.entityId));
    if (!belongsHere) {
      v.push(
        `${label}: orphan/leaked embedding ${row.entityId} under tenant ${row.tenantId} (not a seeded ${label} entity for that tenant)`,
      );
    }
    const key = `${row.tenantId}:${row.entityId}`;
    const list = seen.get(key) ?? [];
    list.push(row);
    seen.set(key, list);
  }

  // Every seeded entity must have exactly one embedding under its own tenant.
  for (const id of entityIds.main) {
    const n = seen.get(`${mainTenantId}:${id}`)?.length ?? 0;
    if (n !== 1) v.push(`${label}: main entity ${id} has ${n} embeddings, expected exactly 1`);
  }
  for (const id of entityIds.decoy) {
    const n = seen.get(`${decoyTenantId}:${id}`)?.length ?? 0;
    if (n !== 1) v.push(`${label}: decoy entity ${id} has ${n} embeddings, expected exactly 1`);
  }

  // Total row counts per tenant must match the manifest.
  const mainCount = countByTenant.get(mainTenantId) ?? 0;
  const decoyCount = countByTenant.get(decoyTenantId) ?? 0;
  if (mainCount !== expected.mainExpectedRows) {
    v.push(
      `${label}: main embedding row count ${mainCount} != expected ${expected.mainExpectedRows}`,
    );
  }
  if (decoyCount !== expected.decoyExpectedRows) {
    v.push(
      `${label}: decoy embedding row count ${decoyCount} != expected ${expected.decoyExpectedRows}`,
    );
  }

  return v;
}

// --- Manifests ---------------------------------------------------------------

interface DatasetManifest {
  seedChecksum: string;
  counts: {
    main: { people: number; groups: number; plans: number; tasks: number };
    decoy: { people: number; groups: number; tasks: number };
  };
  embedding: {
    modelVersion: string;
    tasks: { index: string; mainExpectedRows: number; decoyExpectedRows: number };
    people: { index: string; mainExpectedRows: number; decoyExpectedRows: number };
  };
}

const FACTS_URL = new URL('../manifests/golden-facts.json', import.meta.url);
const DATASET_URL = new URL('../manifests/dataset.json', import.meta.url);

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

// --- Preflight ---------------------------------------------------------------

export interface PreflightOptions {
  checkEmbeddings?: boolean;
}

export interface PreflightResult {
  ok: true;
}

export async function preflightGolden(
  pool: Pool,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  const checkEmbeddings = opts.checkEmbeddings ?? true;
  const violations: string[] = [];

  // 1. Facts drift.
  const committed = readJson<GoldenFacts>(FACTS_URL);
  const actual = await generateGoldenFacts(pool);
  for (const line of diffGoldenFacts(committed, actual)) violations.push(`facts drift: ${line}`);

  const dataset = readJson<DatasetManifest>(DATASET_URL);

  // 2. Seed checksum.
  const checksum = computeSeedChecksum();
  if (checksum !== dataset.seedChecksum) {
    violations.push(
      `seed checksum ${checksum} != dataset.json ${dataset.seedChecksum} (seed changed without re-promoting manifests)`,
    );
  }

  // 3. Relational row counts.
  const [mainCounts, decoyCounts] = await Promise.all([
    relationalCounts(pool, TENANT_ID),
    relationalCounts(pool, DECOY_TENANT_ID),
  ]);
  compareCount(violations, 'main.people', mainCounts.people, dataset.counts.main.people);
  compareCount(violations, 'main.groups', mainCounts.groups, dataset.counts.main.groups);
  compareCount(violations, 'main.plans', mainCounts.plans, dataset.counts.main.plans);
  compareCount(violations, 'main.tasks', mainCounts.tasks, dataset.counts.main.tasks);
  compareCount(violations, 'decoy.people', decoyCounts.people, dataset.counts.decoy.people);
  compareCount(violations, 'decoy.groups', decoyCounts.groups, dataset.counts.decoy.groups);
  compareCount(violations, 'decoy.tasks', decoyCounts.tasks, dataset.counts.decoy.tasks);

  // 4. Isolation — no main-tenant row may carry a decoy canary string.
  const leakedTasks = await pool.query(
    `SELECT id FROM planner.tasks
      WHERE tenant_id = $1 AND deleted_at IS NULL
        AND (title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')`,
    [TENANT_ID, DECOY_TASK_CANARY],
  );
  for (const r of leakedTasks.rows as { id: string }[]) {
    violations.push(`isolation: main task ${r.id} carries decoy canary "${DECOY_TASK_CANARY}"`);
  }
  const leakedPeople = await pool.query(
    `SELECT id FROM people.person
      WHERE tenant_id = $1 AND deleted_at IS NULL AND bio ILIKE '%' || $2 || '%'`,
    [TENANT_ID, DECOY_CANARY_TEXT],
  );
  for (const r of leakedPeople.rows as { id: string }[]) {
    violations.push(`isolation: main person ${r.id} carries decoy canary "${DECOY_CANARY_TEXT}"`);
  }

  // 5. Embeddings.
  if (checkEmbeddings) {
    violations.push(...(await checkEmbeddingsAgainstDb(pool, dataset)));
  }

  if (violations.length > 0) {
    throw new Error(`PREFLIGHT: ${violations.length} violation(s):\n  ${violations.join('\n  ')}`);
  }
  return { ok: true };
}

function compareCount(out: string[], label: string, actual: number, expected: number): void {
  if (actual !== expected) out.push(`count ${label}: ${actual} != expected ${expected}`);
}

async function relationalCounts(
  pool: Pool,
  tenantId: string,
): Promise<{ people: number; groups: number; plans: number; tasks: number }> {
  const [people, groups, plans, tasks] = await Promise.all([
    pool.query(
      `SELECT count(*)::int c FROM people.person WHERE tenant_id=$1 AND deleted_at IS NULL`,
      [tenantId],
    ),
    pool.query(`SELECT count(*)::int c FROM planner.groups WHERE tenant_id=$1`, [tenantId]),
    pool.query(`SELECT count(*)::int c FROM planner.plans WHERE tenant_id=$1`, [tenantId]),
    pool.query(
      `SELECT count(*)::int c FROM planner.tasks WHERE tenant_id=$1 AND deleted_at IS NULL`,
      [tenantId],
    ),
  ]);
  return {
    people: people.rows[0].c,
    groups: groups.rows[0].c,
    plans: plans.rows[0].c,
    tasks: tasks.rows[0].c,
  };
}

async function checkEmbeddingsAgainstDb(pool: Pool, dataset: DatasetManifest): Promise<string[]> {
  const seededTasks = await pool.query(
    `SELECT id, tenant_id FROM planner.tasks WHERE tenant_id IN ($1,$2) AND deleted_at IS NULL`,
    [TENANT_ID, DECOY_TENANT_ID],
  );
  const seededPeople = await pool.query(
    `SELECT id, tenant_id FROM people.person WHERE tenant_id IN ($1,$2) AND deleted_at IS NULL`,
    [TENANT_ID, DECOY_TENANT_ID],
  );
  const taskEmb = await pool.query(
    `SELECT metadata->>'task_id' AS entity_id, metadata->>'tenant_id' AS tenant_id, metadata->>'model_id' AS model_id
       FROM planner_rag.task_embeddings WHERE metadata->>'tenant_id' IN ($1,$2)`,
    [TENANT_ID, DECOY_TENANT_ID],
  );
  const peopleEmb = await pool.query(
    `SELECT metadata->>'person_id' AS entity_id, metadata->>'tenant_id' AS tenant_id, metadata->>'model_id' AS model_id
       FROM people_rag.person_profile_embeddings WHERE metadata->>'tenant_id' IN ($1,$2)`,
    [TENANT_ID, DECOY_TENANT_ID],
  );

  const idsFor = (rows: { id: string; tenant_id: string }[]) => ({
    main: rows.filter((r) => r.tenant_id === TENANT_ID).map((r) => r.id),
    decoy: rows.filter((r) => r.tenant_id === DECOY_TENANT_ID).map((r) => r.id),
  });
  const toRows = (
    rows: { entity_id: string; tenant_id: string; model_id: string }[],
  ): EmbeddingRow[] =>
    rows.map((r) => ({ entityId: r.entity_id, tenantId: r.tenant_id, modelId: r.model_id }));

  return [
    ...checkEmbeddingInvariants({
      label: 'tasks',
      mainTenantId: TENANT_ID,
      decoyTenantId: DECOY_TENANT_ID,
      entityIds: idsFor(seededTasks.rows as { id: string; tenant_id: string }[]),
      rows: toRows(taskEmb.rows as { entity_id: string; tenant_id: string; model_id: string }[]),
      expected: dataset.embedding.tasks,
      expectedModelId: dataset.embedding.modelVersion,
    }),
    ...checkEmbeddingInvariants({
      label: 'people',
      mainTenantId: TENANT_ID,
      decoyTenantId: DECOY_TENANT_ID,
      entityIds: idsFor(seededPeople.rows as { id: string; tenant_id: string }[]),
      rows: toRows(peopleEmb.rows as { entity_id: string; tenant_id: string; model_id: string }[]),
      expected: dataset.embedding.people,
      expectedModelId: dataset.embedding.modelVersion,
    }),
  ];
}
