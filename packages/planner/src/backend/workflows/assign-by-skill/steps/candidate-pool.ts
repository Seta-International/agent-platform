import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { extractSkillMentions } from '@seta/core';
import { and, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { plannerDb } from '../../../db/index.ts';
import { assigneeProjection } from '../../../db/schema.ts';
import { listGroupMemberUserIds } from '../../../read-helpers.ts';
import type { LoadedTask } from './load-task.ts';
import { fetchTaskHistoryHits, type TaskHistoryDeps } from './task-history-hits.ts';

/** Minimum person-profile vector similarity for a fuzzy hit to enter the pool. */
const VECTOR_MIN_SCORE = 0.4;

export interface PoolCandidate {
  userId: string;
  displayName: string;
  skills: string[];
  /** The candidate's own catalog skills that matched the task's required skills
   *  (labels ∪ text mentions) — the subset worth showing, vs. their full skill list. */
  matchedSkills: string[];
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

interface SkillsForUsersInput {
  userIds: string[];
}
interface SkillsForUsersOutput {
  users: Array<{ userId: string; skills: string[] }>;
}

function findSkillsForUsersTool():
  | CrossModuleReadToolSpec<SkillsForUsersInput, SkillsForUsersOutput>
  | undefined {
  return AgentRegistry.listCrossModuleReadTools().find(
    (t) => t.id === 'people_getSkillsForUsers',
  ) as CrossModuleReadToolSpec<SkillsForUsersInput, SkillsForUsersOutput> | undefined;
}

/**
 * Build the candidate pool for a task. Suggestions are always scoped to the
 * task's plan group, so the group's **active members** are the candidate
 * universe — seeded up front so a task with no labels (or no vector hits) still
 * has people to rank. Exact-label overlap, person-profile
 * vector similarity, and task history are layered on as ranking signals, and
 * each candidate's skills are read from People (the system of record) rather
 * than a stale local projection.
 */
export interface CandidatePoolResult {
  candidates: PoolCandidate[];
  /** Distinct catalog skills the task calls for (labels ∪ text mentions) — the
   *  denominator for the exact-overlap signal. */
  requiredSkillCount: number;
}

export async function candidatePool(
  input: {
    tenantId: string;
    callerUserId: string;
    callerRoleSummary: { roles: string[]; cross_tenant_read: boolean };
    task: LoadedTask;
  },
  deps?: CandidatePoolDeps,
): Promise<CandidatePoolResult> {
  // The task's required skills come from its labels AND its title/description
  // text, all resolved through the canonical catalog. This is what lets a
  // label-less "Migrate the ReactJS front-end…" task still match React/Node.js
  // holders deterministically — the exact signal no longer needs explicit labels.
  const required = await extractSkillMentions(
    { tenant_id: input.tenantId },
    [input.task.title, input.task.description ?? '', input.task.labels.join(' ')].join('\n'),
  );
  const exactTerms = [...new Set([...input.task.labels, ...required.map((r) => r.name)])];
  const requiredSkillCount = Math.max(required.length, input.task.labels.length);

  const [exactRows, vectorOut, historyOut, memberIds] = await Promise.all([
    fetchExactHits(input.tenantId, input.callerUserId, input.callerRoleSummary, exactTerms),
    fetchVectorHits(input.tenantId, input.callerUserId, input.callerRoleSummary, input.task),
    deps
      ? fetchTaskHistoryHits({ tenantId: input.tenantId, task: input.task }, deps)
      : Promise.resolve([]),
    listGroupMemberUserIds(input.tenantId, input.task.groupId),
  ]);

  // Candidate universe = active (not deactivated / not OOO-through-due) members.
  const active = await fetchActiveProjections(input.tenantId, memberIds, input.task.due_at);
  const byUser = new Map<string, PoolCandidate>();
  for (const m of active) {
    byUser.set(m.user_id, {
      userId: m.user_id,
      displayName: m.display_name,
      skills: [],
      matchedSkills: [],
      exactOverlap: 0,
      vectorScore: null,
      historyScore: null,
      historyMatches: 0,
    });
  }

  // Layer the tenant-wide signals onto members only (non-members are out of scope).
  for (const row of exactRows) {
    const c = byUser.get(row.userId);
    if (c) {
      c.exactOverlap = Number(row.overlap);
      c.matchedSkills = row.matchedSkills;
    }
  }
  for (const hit of vectorOut) {
    const c = byUser.get(hit.userId);
    if (c) c.vectorScore = hit.score;
  }
  for (const hit of historyOut) {
    const c = byUser.get(hit.userId);
    if (c) {
      c.historyScore = hit.historyScore;
      c.historyMatches = hit.matches;
    }
  }

  // Skills come from People (system of record), one batched read for the pool.
  const skillsByUser = await fetchMemberSkills(
    input.tenantId,
    input.callerUserId,
    input.callerRoleSummary,
    Array.from(byUser.keys()),
  );
  for (const [userId, c] of byUser) c.skills = skillsByUser.get(userId) ?? [];

  return { candidates: Array.from(byUser.values()), requiredSkillCount };
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
 * Exact-match signal: how many of the task's required skills (labels ∪ text
 * mentions) each user's catalog skills cover. Delegated to People's
 * people_searchUsersBySkillExact, which resolves the free-text terms to
 * canonical core.skill ids (term "reactjs" ↔ catalog skill "React") and matches
 * person_skill by id, not string equality. Returns per-user overlap counts; the
 * caller intersects with the group and applies the availability gate.
 */
async function fetchExactHits(
  tenantId: string,
  callerUserId: string,
  callerRoleSummary: { roles: string[]; cross_tenant_read: boolean },
  terms: string[],
): Promise<Array<{ userId: string; overlap: number; matchedSkills: string[] }>> {
  if (terms.length === 0) return [];
  const tool = findSkillExactTool();
  if (!tool) return [];
  try {
    const out = await tool.execute({
      session: { tenant_id: tenantId, user_id: callerUserId, role_summary: callerRoleSummary },
      input: { labels: terms },
    });
    return out.hits.map((h) => ({
      userId: h.userId,
      overlap: h.overlap,
      matchedSkills: h.matchedSkills,
    }));
  } catch {
    return [];
  }
}

/** Batched People read of catalog skills for the pooled members. */
async function fetchMemberSkills(
  tenantId: string,
  callerUserId: string,
  callerRoleSummary: { roles: string[]; cross_tenant_read: boolean },
  userIds: string[],
): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();
  const tool = findSkillsForUsersTool();
  if (!tool) return new Map();
  try {
    const out = await tool.execute({
      session: { tenant_id: tenantId, user_id: callerUserId, role_summary: callerRoleSummary },
      input: { userIds },
    });
    return new Map(out.users.map((u) => [u.userId, u.skills]));
  } catch {
    return new Map();
  }
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
        inArray(assigneeProjection.user_id, userIds),
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
      // Relevance floor: without a minimum score the top-20 neighbours always
      // come back, admitting weakly-related people who then float up on the
      // load signal. The rank-level evidence gate is the backstop.
      input: { queryText, topK: 20, minScore: VECTOR_MIN_SCORE },
    });
    return out.hits;
  } catch {
    return [];
  }
}
