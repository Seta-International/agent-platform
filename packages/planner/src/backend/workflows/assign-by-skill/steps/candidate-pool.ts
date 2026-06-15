import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { assigneeProjection } from '../../../db/schema.ts';
import type { LoadedTask } from './load-task.ts';
import { fetchTaskHistoryHits, type TaskHistoryDeps } from './task-history-hits.ts';

export interface PoolCandidate {
  userId: string;
  displayName: string;
  skills: string[];
  exactOverlap: number;
  vectorScore: number | null;
  historyScore: number | null;
  historyMatches: number;
}

export type CandidatePoolDeps = TaskHistoryDeps;

interface VectorSearchInput {
  queryText: string;
  topK: number;
  minScore?: number;
}
interface VectorSearchOutput {
  hits: Array<{ userId: string; score: number }>;
}

function findVectorTool():
  | CrossModuleReadToolSpec<VectorSearchInput, VectorSearchOutput>
  | undefined {
  return AgentRegistry.listCrossModuleReadTools().find(
    (t) => t.id === 'identity_searchUsersBySkillVector',
  ) as CrossModuleReadToolSpec<VectorSearchInput, VectorSearchOutput> | undefined;
}

/**
 * Three signal branches run in parallel:
 * - **Exact** (SQL): task label names ∩ assignee_projection.skills, GIN-friendly
 *   via the && operator, then cardinality only for the matching subset.
 * - **Skill vector**: free-text search over identity user-profile embeddings
 *   (catches role/bio matches when literal tags miss).
 * - **History vector** (optional): "who's worked on similar tasks before" —
 *   skill proxy when users haven't filled in their skills profile. Skipped
 *   when no history deps are provided.
 *
 * Results merged by userId. Vector-only hits whose projection is missing
 * (stale embedding) are dropped.
 */
export async function candidatePool(
  input: {
    tenantId: string;
    callerUserId: string;
    callerRoleSummary: { roles: string[]; cross_tenant_read: boolean };
    task: LoadedTask;
  },
  deps?: CandidatePoolDeps,
): Promise<PoolCandidate[]> {
  const [exactRows, vectorOut, historyOut] = await Promise.all([
    fetchExactOverlap(input.tenantId, input.task),
    fetchVectorHits(input.tenantId, input.callerUserId, input.callerRoleSummary, input.task),
    deps
      ? fetchTaskHistoryHits({ tenantId: input.tenantId, task: input.task }, deps)
      : Promise.resolve([]),
  ]);

  const byUser = new Map<string, PoolCandidate>();
  for (const row of exactRows) {
    byUser.set(row.user_id, {
      userId: row.user_id,
      displayName: row.display_name,
      skills: row.skills ?? [],
      exactOverlap: Number(row.overlap),
      vectorScore: null,
      historyScore: null,
      historyMatches: 0,
    });
  }

  const needsProfileLookup = new Set<string>();
  for (const h of vectorOut) if (!byUser.has(h.userId)) needsProfileLookup.add(h.userId);
  for (const h of historyOut) if (!byUser.has(h.userId)) needsProfileLookup.add(h.userId);

  const profiles =
    needsProfileLookup.size === 0
      ? new Map<string, { display_name: string; skills: string[] }>()
      : await fetchProjections(input.tenantId, Array.from(needsProfileLookup));

  for (const hit of vectorOut) {
    const existing = byUser.get(hit.userId);
    if (existing) {
      existing.vectorScore = hit.score;
      continue;
    }
    const prof = profiles.get(hit.userId);
    if (!prof) continue;
    byUser.set(hit.userId, {
      userId: hit.userId,
      displayName: prof.display_name,
      skills: prof.skills,
      exactOverlap: 0,
      vectorScore: hit.score,
      historyScore: null,
      historyMatches: 0,
    });
  }

  for (const hit of historyOut) {
    const existing = byUser.get(hit.userId);
    if (existing) {
      existing.historyScore = hit.historyScore;
      existing.historyMatches = hit.matches;
      continue;
    }
    const prof = profiles.get(hit.userId);
    if (!prof) continue;
    byUser.set(hit.userId, {
      userId: hit.userId,
      displayName: prof.display_name,
      skills: prof.skills,
      exactOverlap: 0,
      vectorScore: null,
      historyScore: hit.historyScore,
      historyMatches: hit.matches,
    });
  }

  return Array.from(byUser.values());
}

async function fetchExactOverlap(
  tenantId: string,
  task: LoadedTask,
): Promise<Array<{ user_id: string; display_name: string; skills: string[]; overlap: number }>> {
  if (task.labels.length === 0) return [];

  // pg-driver serializes JS arrays as comma-separated scalars; inline as a
  // SQL ARRAY[...]::text[] literal so the && operator works.
  const tagsLiteral = sql.raw(
    `ARRAY[${task.labels.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`,
  );

  const db = plannerDb();
  const overlapExpr = sql<number>`cardinality(
    ARRAY(
      SELECT unnest(${assigneeProjection.skills})
      INTERSECT
      SELECT unnest(${tagsLiteral})
    )
  )`.as('overlap');

  const oooClause = task.due_at
    ? or(
        ne(assigneeProjection.availability_status, 'ooo'),
        isNull(assigneeProjection.ooo_until),
        gt(assigneeProjection.ooo_until, task.due_at),
      )
    : ne(assigneeProjection.availability_status, 'ooo');

  const rows = await db
    .select({
      user_id: assigneeProjection.user_id,
      display_name: assigneeProjection.display_name,
      skills: assigneeProjection.skills,
      overlap: overlapExpr,
    })
    .from(assigneeProjection)
    .where(
      and(
        eq(assigneeProjection.tenant_id, tenantId),
        isNull(assigneeProjection.deactivated_at),
        oooClause,
        sql`${assigneeProjection.skills} && ${tagsLiteral}`,
      ),
    )
    .orderBy(sql`overlap DESC`)
    .limit(30);

  return rows;
}

async function fetchVectorHits(
  tenantId: string,
  callerUserId: string,
  callerRoleSummary: { roles: string[]; cross_tenant_read: boolean },
  task: LoadedTask,
): Promise<Array<{ userId: string; score: number }>> {
  const tool = findVectorTool();
  if (!tool) return [];

  // Include title, description, and labels — labels carry domain context (e.g.,
  // "Mobile", "Backend") that ties to skills via the user-profile embedding
  // (which already contains role + skills + bio per spec §6.2).
  const parts = [task.title, task.description, task.labels.join(', ')]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const queryText = parts.join('\n\n');
  if (!queryText) return [];

  try {
    const out = await tool.execute({
      session: { tenant_id: tenantId, user_id: callerUserId, role_summary: callerRoleSummary },
      input: { queryText, topK: 20, minScore: 0 },
    });
    return out.hits;
  } catch {
    return [];
  }
}

async function fetchProjections(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, { display_name: string; skills: string[] }>> {
  const db = plannerDb();
  const idsLiteral = sql.raw(
    `ARRAY[${userIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')}]::uuid[]`,
  );
  const rows = await db
    .select({
      user_id: assigneeProjection.user_id,
      display_name: assigneeProjection.display_name,
      skills: assigneeProjection.skills,
    })
    .from(assigneeProjection)
    .where(
      and(
        eq(assigneeProjection.tenant_id, tenantId),
        isNull(assigneeProjection.deactivated_at),
        sql`${assigneeProjection.user_id} = ANY(${idsLiteral})`,
      ),
    );
  return new Map(rows.map((r) => [r.user_id, { display_name: r.display_name, skills: r.skills }]));
}
