import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { assigneeProjection } from '../../../db/schema.ts';
import { listGroupMemberUserIds } from '../../../read-helpers.ts';
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
    (t) => t.id === 'people_searchUsersBySkillVector',
  ) as CrossModuleReadToolSpec<VectorSearchInput, VectorSearchOutput> | undefined;
}

/**
 * Three signal branches run in parallel:
 * - **Exact** (SQL): task label names ∩ assignee_projection.skills, GIN-friendly
 *   via the && operator, then cardinality only for the matching subset.
 * - **Skill vector**: free-text search over People person-profile embeddings
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
  const [exactRows, vectorOut, historyOut, memberIds] = await Promise.all([
    fetchExactHits(input.tenantId, input.callerUserId, input.callerRoleSummary, input.task),
    fetchVectorHits(input.tenantId, input.callerUserId, input.callerRoleSummary, input.task),
    deps
      ? fetchTaskHistoryHits({ tenantId: input.tenantId, task: input.task }, deps)
      : Promise.resolve([]),
    listGroupMemberUserIds(input.tenantId, input.task.groupId),
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

  // Group-membership gate (business rule): only members of the task's plan
  // group may be suggested. Applied once over the merged map so it covers all
  // three tenant-wide branches (exact, vector, history) uniformly.
  const memberSet = new Set(memberIds);
  return Array.from(byUser.values()).filter((c) => memberSet.has(c.userId));
}

interface SkillExactSearchInput {
  labels: string[];
}
interface SkillExactSearchOutput {
  hits: Array<{ userId: string; matchedSkills: string[]; overlap: number }>;
}

function findSkillExactTool():
  | CrossModuleReadToolSpec<SkillExactSearchInput, SkillExactSearchOutput>
  | undefined {
  return AgentRegistry.listCrossModuleReadTools().find(
    (t) => t.id === 'people_searchUsersBySkillExact',
  ) as CrossModuleReadToolSpec<SkillExactSearchInput, SkillExactSearchOutput> | undefined;
}

/**
 * Exact-match branch. Skills moved to People, so assignee_projection.skills
 * is no longer event-populated — the match is delegated to People's
 * people_searchUsersBySkillExact tool (case-insensitive task label ∩
 * person_skill). The returned user_ids are then joined against the planner
 * projection for display_name and availability (deactivated / OOO), which the
 * projection still owns.
 */
async function fetchExactHits(
  tenantId: string,
  callerUserId: string,
  callerRoleSummary: { roles: string[]; cross_tenant_read: boolean },
  task: LoadedTask,
): Promise<Array<{ user_id: string; display_name: string; skills: string[]; overlap: number }>> {
  if (task.labels.length === 0) return [];
  const tool = findSkillExactTool();
  if (!tool) return [];

  let hits: SkillExactSearchOutput['hits'];
  try {
    const out = await tool.execute({
      session: { tenant_id: tenantId, user_id: callerUserId, role_summary: callerRoleSummary },
      input: { labels: task.labels },
    });
    hits = out.hits;
  } catch {
    return [];
  }
  if (hits.length === 0) return [];

  const active = await fetchActiveProjections(
    tenantId,
    hits.map((h) => h.userId),
    task.due_at,
  );
  const byUser = new Map(active.map((r) => [r.user_id, r.display_name]));

  const rows: Array<{ user_id: string; display_name: string; skills: string[]; overlap: number }> =
    [];
  for (const h of hits) {
    const displayName = byUser.get(h.userId);
    if (displayName === undefined) continue; // deactivated / OOO / no projection row
    rows.push({
      user_id: h.userId,
      display_name: displayName,
      skills: h.matchedSkills,
      overlap: h.overlap,
    });
  }
  rows.sort((a, b) => b.overlap - a.overlap);
  return rows.slice(0, 30);
}

/**
 * Active (not deactivated, not OOO-through-due-date) projection rows for a set
 * of user_ids — the availability gate the exact SQL branch used to apply inline.
 */
async function fetchActiveProjections(
  tenantId: string,
  userIds: string[],
  dueAt: Date | null,
): Promise<Array<{ user_id: string; display_name: string }>> {
  if (userIds.length === 0) return [];
  const db = plannerDb();
  const idsLiteral = sql.raw(
    `ARRAY[${userIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')}]::uuid[]`,
  );
  const oooClause = dueAt
    ? or(
        ne(assigneeProjection.availability_status, 'ooo'),
        isNull(assigneeProjection.ooo_until),
        gt(assigneeProjection.ooo_until, dueAt),
      )
    : ne(assigneeProjection.availability_status, 'ooo');

  return db
    .select({
      user_id: assigneeProjection.user_id,
      display_name: assigneeProjection.display_name,
    })
    .from(assigneeProjection)
    .where(
      and(
        eq(assigneeProjection.tenant_id, tenantId),
        isNull(assigneeProjection.deactivated_at),
        oooClause,
        sql`${assigneeProjection.user_id} = ANY(${idsLiteral})`,
      ),
    );
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
  // "Mobile", "Backend") that ties to skills via the person-profile embedding
  // (which already contains skills + bio).
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
